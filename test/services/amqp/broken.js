var amqp = require('../../../build/amqp');

var server = amqp.server('localhost', 'rpc_queue', function(a, cb){

  cb(x);
});

process.send('');

process.on('exit', server.close);