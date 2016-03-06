var amqp = require('../../../build/amqp');

var server = amqp.server('localhost', 'rpc_queue', require('../fibonacci/fast'));

process.on('exit', server.close);


