require('babel/register');

var amqp = require('../../../lib/amqp');

var server = amqp.server('localhost', require('../fibonacci/fast'));

process.on('exit', server.close);
