var amqp = require('../../../index');

var server = amqp.server('localhost', require('../fibonacci/fast'));

process.send('');

process.on('exit', server.close);


