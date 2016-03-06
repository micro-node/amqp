import {isFunction} from 'lodash';
import * as amqp from 'amqplib';
import * as uuid from 'node-uuid';
import * as rpc from 'micro-node-json-rpc';

const debug = require('debug')('amqp');

const protocol = 'amqp';
const contentType = 'application/json';

const connections = [];
const callbacks = {};

/**
 *
 * The AMQP RPC Client
 *
 * @param addr
 * @returns {Function} client function
 */
export function client(addr, queue){

  let Q = assetQueue(addr, '', {exclusive: true});

  Q.then(function([ch, q]) {

    let replyTo = q.queue;

    debug('[client] Awaiting RPC response');

    ch.assertQueue(queue, {durable: false});

    ch.consume(replyTo, function (msg) {

      let callback = callbacks[msg.properties.correlationId];

      if(callback !== undefined){

        debug('[client] Receive RPC response %s', msg.properties.correlationId);
        debug('[client] Response data %s', msg.content.toString());

        let resp = JSON.parse(msg.content.toString());

        callback(resp.error, resp.result);

        delete callbacks[msg.properties.correlationId];
      }
    });
  });

  // the actual requester
  return function(req, options, callback){

    if(isFunction(options)){

      callback = options;
      options = {};
    }

    Q.then(function([ch, q]){

      req.id = req.id || uuid.v4();

      let replyTo = q.queue;
      let stringReq = JSON.stringify(req);

      callbacks[req.id] = callback;

      if(options.timeout){

        timeout(req, options.timeout);
      }

      debug('[client] Send RPC request %s', req.id);
      debug('[client] Request data %s', stringReq);

      ch.sendToQueue(queue, new Buffer(stringReq), {correlationId: req.id, replyTo, contentType});

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
export function server(addr, queue, func, callback){

  let connection = createChannel(addr).then(function([conn, ch]){

    ch.assertQueue(queue, {durable: false});
    ch.prefetch(1);

    debug('[server] Awaiting RPC requests');

    ch.consume(queue, function reply(msg) {

      let req = JSON.parse(msg.content.toString());

      debug('[server] Request received %s', msg.properties.correlationId);
      debug('[server] Request data %s', msg.content.toString());

      try{

        func(req, function(resp){

          let stringResp = JSON.stringify(resp);

          debug('[server] Send RPC request %s', msg.properties.correlationId);
          debug('[server] Request data %s', stringResp);

          ch.sendToQueue(msg.properties.replyTo, new Buffer(stringResp), {correlationId: msg.properties.correlationId, contentType});
          ch.ack(msg);
        });

      }catch(err){

        debug('[server] Error for %s', msg.properties.correlationId);
        debug('[server] Error data', err);

        ch.sendToQueue(msg.properties.replyTo, new Buffer(JSON.stringify(rpc.error(req, err))), {correlationId: msg.properties.correlationId, contentType});
        ch.ack(msg);
      }
    });

    // call with connection
    callback && callback(null, conn);

    return conn;

  }, callback);

  let proxy = {

    on: function(...args){

      connection.then(conn => conn.on(...args));
    },

    close: function(){

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
function timeout(req, delay){

  setTimeout(_timeout, delay);

  function _timeout(){

    let callback = callbacks[req.id];

    if(!callback) return;

    let err = new Error('request timeout');

    err.name = 'Timeout';

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
export function deleteQueue(addr, queue, options){

  return createChannel(addr)
    .then(([_, ch])=> ch.deleteQueue(queue, options), debugError);
}

// asset queue helper
function assetQueue(addr, queue, options){

  return createChannel(addr).then((data) =>{

    let ch = data[1];

    return ch.assertQueue(queue, options).then(q => [ch, q]);
  });
}

// create channel helper
function createChannel(addr){

  return amqp.connect(genAddr(addr)).then((conn) => {

    return conn.createChannel().then(ch => {

      connections.push(conn);

      return [conn, ch];
    });

  }, debugError);
}

function genAddr(addr, proc = protocol){

  return `${proc}://${addr}`;
}


function debugError(err){

  debug('[error] ', err);

  return err;
}

// close all connections on exit
process.on('exit', ()=> connections.forEach((conn)=>conn.close()));
