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

    ch.consume(replyTo, function (msg) {

      let callback = callbacks[msg.properties.correlationId];

      if(callback !== undefined){

        debug('[client] Receive RPC response %s', msg.properties.correlationId);
        debug('[client] Response data %s', msg.content.toString());

        callback(JSON.parse(msg.content.toString()));
        delete callbacks[msg.properties.correlationId];
      }
    });
  }, console.warn);

  return function(req, callback){

    Q.then(function([ch, q]){

      let correlationId = req.id || uuid.v4();
      let replyTo = q.queue;

      callbacks[correlationId] = callback;

      debug('[client] Send RPC request %s', correlationId);
      debug('[client] Request data %s', req);

      ch.sendToQueue(queue, new Buffer(JSON.stringify(req)), {correlationId, replyTo, contentType});
    }, console.warn);
  };
}

/**
 * The AMQP RPC Server
 *
 * @param addr
 * @param func server function
 * @returns {{on: proxy.on, close: proxy.close}}
 */
export function server(addr, queue, func){

  let connection = createChannel(addr).then(function([conn, ch]){

    ch.assertQueue(queue, {durable: false});
    ch.prefetch(1);

    debug('[server] Awaiting RPC requests');

    ch.consume(queue, function reply(msg) {

      let req = JSON.parse(msg.content.toString());

      debug('[server] Request received %s', msg.properties.correlationId);
      debug('[server] Request data %s', req);

      try{

        func(req, function(resp){

          debug('[server] Send RPC request %s', msg.properties.correlationId);
          debug('[server] Request data %s', resp);

          ch.sendToQueue(msg.properties.replyTo, new Buffer(JSON.stringify(resp)), {correlationId: msg.properties.correlationId, contentType});
          ch.ack(msg);
        });

      }catch(err){

        debug('[server] Error for %s', msg.properties.correlationId);
        debug('[server] Error data', err);

        ch.sendToQueue(msg.properties.replyTo, new Buffer(JSON.stringify(rpc.error(req, err))), {correlationId: msg.properties.correlationId, contentType});
        ch.ack(msg);
      }
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

/**
 * deleting queues is also usefull
 * @param addr
 * @param queue
 * @param options
 * @returns {Promise|*|Promise.<T>}
 */
export function deleteQueue(addr, queue, options){

  return createChannel(addr)
    .then(([_, ch])=> ch.deleteQueue(queue, options));
}

// asset queue helper
function assetQueue(addr, queue, options){

  return createChannel(addr)
      .then(([_, ch])=> ch.assertQueue(queue, options).then(q => [ch, q]));
}

// create channel helper
function createChannel(addr){

  return amqp.connect(genAddr(addr))
      .then((conn) =>
        conn.createChannel().then(ch => {

          connections.push(conn);

          return [conn, ch];

        }, console.warn)
        , console.warn);
}

function genAddr(addr, proc = protocol){

  return `${proc}://${addr}`;
}

process.on('exit', ()=> connections.forEach((conn)=>conn.close()));
