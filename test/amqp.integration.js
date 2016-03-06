var assert = require('assert');
var async = require('async');
var cp = require('child_process');
var amqp = require('../build/amqp');

var queue = 'rpc_queue';

var children = [];

// helper functions
function server(cb){

  var child = cp.fork(__dirname + '/services/amqp/index.js');

  cb();

  children.push(child);
}

function brokenServer(cb){

  var child = cp.fork(__dirname + '/services/amqp/broken.js');

  child.on('message', cb);

  children.push(child);
}

function client(addr){

  var args = Array.prototype.slice.call(arguments);

  args[0] = {params: [args[0]]};

  var amqpClient = amqp.client('localhost', queue);

  amqpClient.apply(amqpClient, args);
}


function killAll(){

  children.forEach(function(child){

    child.kill();
  })
}

process.on('exit', killAll);

describe('AMQP RPC Server Client', function() {

  this.timeout(10000);

  describe('connection errors', function(){

    it('client should respond with error', function(done){

      var brokenClient = amqp.client('fakeuser@localhost', 'test');

      brokenClient({}, function(err){

        assert(err);
        done();
      })
    })
  })


  describe('server <-> client', function(){

    before(server);

    describe('1 to N', function(){


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
    })


    describe('N to N', function(){

      before(server);
      before(server);

      it('one client N srever', function(done){

        var requests = [30, 35, 40, 47, 53];
        var responses = [832040, 9227465, 102334155, 2971215073, 53316291173];

        async.map(requests, client, function(err, results){

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
    })
  });

  describe('error handling', function(){

    before(killAll);
    before(brokenServer);

    it('should retun error for broken client', function(done){


      client(0, function(err){

        assert(err.name, 'ReferenceError');
        done();
      })
    })
  })

  describe('timeout handling', function(){

    before(killAll);

    it('should retun error for timeout', function(done){

      client(0, {timeout: 100}, function(err){

        assert(err.name, 'Timeout');
        done();
      })
    })
  })

  describe('cleanups', function(){

    before(killAll);

    it('should delete the queue', function(done){

      amqp.deleteQueue('localhost', queue)
        .then(function(){
          done()
        });
    })
  });
});
