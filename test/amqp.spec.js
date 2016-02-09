require('babel-register');

var assert = require('assert');
var async = require('async');
var cp = require('child_process');
var amqp = require('../lib/amqp');

// helper functions
function server(cb){

  var proc = cp.fork(__dirname + '/services/amqp/index.js');

  proc.on('message', cb);
}

function client(){

  amqp.client('localhost').apply(null, arguments);
}

describe('AMQP RPC Server Client', function() {

  this.timeout(20000);

  before(server);

  it('should one client one server', function(done){

    client(40, function(err, resp){

      assert.equal(resp, 102334155);

      done(err);
    })
  });

  it('N clients one server', function(done){

    var requests = [30, 35, 40, 47, 53];
    var responses = [832040, 9227465, 102334155, 2971215073, 53316291173];

    async.map(requests, client, function(err, results){

      assert.deepEqual(results, responses);
      done(err)
    })
  });

  before(server);
  before(server);

  it('one client N srever', function(){

    var requests = [30, 35, 40, 47, 53];
    var responses = [832040, 9227465, 102334155, 2971215073, 53316291173];

    async.map(requests, amqp.client('localhost'), function(err, results){

      assert.deepEqual(results, responses);
      done(err)
    })

  });

  it('N clients N servers', function(done){

    var requests = [30, 35, 40, 47, 53];
    var responses = [832040, 9227465, 102334155, 2971215073, 53316291173];

    async.map(requests, client, function(err, results){

      assert.deepEqual(results, responses);
      done(err)
    })
  });
});
