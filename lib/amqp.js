import { isFunction } from "lodash";
import * as amqp from "amqplib";
import * as rpc from "micro-node-json-rpc";

const debug = require("debug");

const log = debug("amqp:log");
const logError = debug("amqp:error");
const logData = debug("amqp-data:log");

const protocol = "amqp";
const contentType = "application/json";

const connections = [];
const callbacks = {};

/**
 *
 * The AMQP RPC Client
 *
 * @param addr
 * @returns {Function} client function
 */
export function client(addr, queue) {
  let Q = assetQueue(addr, "", { exclusive: true });

  Q.then(function([ch, q]) {
    let replyTo = q.queue;

    log("[client] Awaiting RPC response");

    ch.assertQueue(queue, { durable: false });

    ch.consume(replyTo, function(msg) {
      let callback = callbacks[msg.properties.correlationId];

      if (callback !== undefined) {
        log("[client] Receive RPC response %s", msg.properties.correlationId);
        logData("[client] Response data %s", msg.content.toString());

        let resp = JSON.parse(msg.content.toString());

        callback(resp.error, resp.result);
        ch.ack(msg);

        delete callbacks[msg.properties.correlationId];
      }
    });
  });

  // the actual requester
  return function(req, options, callback) {
    if (isFunction(options)) {
      callback = options;
      options = {};
    }

    Q.then(function([ch, q]) {
      let replyTo = q.queue;
      let stringReq = JSON.stringify(req);

      if (req.id) callbacks[req.id] = callback;

      if (options && options.timeout) {
        timeout(req, options.timeout);
      }

      log("[client] Send RPC request %s", req.id);
      logData("[client] Request data %s", stringReq);

      ch.sendToQueue(queue, new Buffer(stringReq), {
        correlationId: req.id,
        replyTo,
        contentType
      });
    }, callback);
  };
}

/**
 * The AMQP RPC Server
 *
 * @param addr
 * @param func server function
 * @returns {{on: proxy.on, close: proxy.close}}
 */
export function server(addr, queue, func, callback) {
  let connection = createChannel(addr).then(function([conn, ch]) {
    ch.assertQueue(queue, { durable: false });
    ch.prefetch(1);

    log("[server] Awaiting RPC requests");

    ch.consume(queue, function reply(msg) {
      let req = JSON.parse(msg.content.toString());

      log("[server] Request received %s", msg.properties.correlationId);
      logData("[server] Request data %s", msg.content.toString());

      try {
        func(req, function(resp) {
          let stringResp = JSON.stringify(resp);

          log("[server] Send RPC request %s", msg.properties.correlationId);
          logData("[server] Request data %s", stringResp);

          ch.sendToQueue(msg.properties.replyTo, new Buffer(stringResp), {
            correlationId: msg.properties.correlationId,
            contentType
          });
          ch.ack(msg);
        });
      } catch (err) {
        logError("[server] Error for %s", msg.properties.correlationId);
        logError("[server] Error data", err);

        ch.sendToQueue(
          msg.properties.replyTo,
          new Buffer(JSON.stringify(rpc.error(req, err))),
          { correlationId: msg.properties.correlationId, contentType }
        );
        ch.ack(msg);
      }
    });

    // call with connection
    callback && callback(null, conn);

    return conn;
  }, callback);

  let proxy = {
    on: function(...args) {
      connection.then(conn => conn.on(...args));
    },

    close: function() {
      connection.then(conn => conn.close());
    }
  };

  return proxy;
}

/**
 * timeout handler
 * @param req
 * @param delay
 */
function timeout(req, delay) {
  setTimeout(_timeout, delay);

  function _timeout() {
    let callback = callbacks[req.id];

    if (!callback) return;

    let err = new Error("request timeout");

    err.name = "Timeout";

    callback(rpc.error(req, err).error);

    delete callbacks[req.id];
  }
}

/**
 * deleting queues is also usefull
 * @param addr
 * @param queue
 * @param options
 * @returns {Promise|*|Promise.<T>}
 */
export function deleteQueue(addr, queue, options) {
  return createChannel(addr).then(
    ([_, ch]) => ch.deleteQueue(queue, options),
    debugError
  );
}

// asset queue helper
function assetQueue(addr, queue, options) {
  return createChannel(addr).then(data => {
    let ch = data[1];

    return ch.assertQueue(queue, options).then(q => [ch, q]);
  });
}

// create channel helper
function createChannel(addr) {
  return amqp.connect(genAddr(addr)).then(conn => {
    return conn.createChannel().then(ch => {
      connections.push(conn);

      return [conn, ch];
    });
  }, debugError);
}

function genAddr(addr, proc = protocol) {
  return `${proc}://${addr}`;
}

function debugError(err) {
  logError("[error] ", err);

  return err;
}

// close all connections on exit
process.on("exit", () => connections.forEach(conn => conn.close()));
