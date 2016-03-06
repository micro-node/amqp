var amqp = require('../../../build/amqp');

var server = amqp.server('localhost', 'rpc_queue', require('../fibonacci/fast'), function(err){

  if(err) return;

  //process.send('');
});

process.send('');

process.on('exit', server.close);


