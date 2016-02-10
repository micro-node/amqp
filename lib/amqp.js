import * as amqp from 'amqplib';
import * as uuid from 'node-uuid';

const debug = require('debug')('amqp');

const protocol = 'amqp';
const contentType = 'application/json';
const rpcQueue = 'rpc_queue';

const connections = [];
const callbacks = {};

/**
 *
 * The AMQP RPC Client
 *
 * @param addr
 * @returns {Function} client function
 */
export function client(addr){

  let Q = assetQueue(addr, '', {exclusive: true});

  Q.then(function([ch, q]) {

    let replyTo = q.queue;

    debug('[client] Awaiting RPC response');

    ch.consume(replyTo, function (msg) {

      let callback = callbacks[msg.properties.correlationId];

      if(callback !== undefined){

        debug('[client] Receive RPC response %s', msg.properties.correlationId);

        callback(null, JSON.parse(msg.content.toString()));

        delete callbacks[msg.properties.correlationId];
      }
    });
  }, console.warn);

  return function(req, callback){

    Q.then(function([ch, q]){

      let correlationId = uuid.v4();
      let replyTo = q.queue;

      callbacks[correlationId] = callback;

      debug('[client] Send RPC request %s', correlationId);

      ch.sendToQueue(rpcQueue, new Buffer(JSON.stringify(req)), {correlationId, replyTo, contentType});
    });
  };
}

/**
 * The AMQP RPC Server
 *
 * @param addr
 * @param func server function
 * @returns {{on: proxy.on, close: proxy.close}}
 */
export function server(addr, func){

  let connection = createChannel(addr).then(function([conn, ch]){

    ch.assertQueue(rpcQueue, {durable: false});
    ch.prefetch(1);

    debug('[server] Awaiting RPC requests');

    ch.consume(rpcQueue, function reply(msg) {

      let req = JSON.parse(msg.content.toString());

      debug('[server] Request received %s', msg.properties.correlationId);

      func(req, function(err, resp){

        debug('[server] Send RPC request %s', msg.properties.correlationId);

        ch.sendToQueue(msg.properties.replyTo, new Buffer(JSON.stringify(resp)), {correlationId: msg.properties.correlationId, contentType});
        ch.ack(msg);
      });
    });

    return conn;

  }, console.warn);

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

// asset queue helper
function assetQueue(addr, queue, options){

  return createChannel(addr)
      .then(([_, ch])=> ch.assertQueue(queue, options).then(q => [ch, q]));
}

// create channel helper
function createChannel(addr){

  return amqp.connect(genAddr(addr))
      .then((conn) => conn.createChannel()
      .then(ch => {

        connections.push(conn);

        return [conn, ch];
      }));
}

function genAddr(addr, proc = protocol){

  return `${proc}://${addr}`;
}

process.on('exit', ()=> connections.forEach((conn)=>conn.close()));
