[![Build Status](https://travis-ci.org/micro-node/amqp.svg)](http://travis-ci.org/micro-node/amqp)
[![Dependency Status](https://david-dm.org/micro-node/amqp.svg)](https://david-dm.org/micro-node/amqp)
[![devDependency Status](https://david-dm.org/micro-node/amqp/dev-status.svg)](https://david-dm.org/micro-node/amqp#info=devDependencies)
[![Coverage Status](https://coveralls.io/repos/github/micro-node/amqp/badge.svg?branch=master)](https://coveralls.io/github/micro-node/amqp?branch=master)

# AMQP RPC Helper

This is a slim implementation of RPC calls using AMQP.

## Requirements

- NodeJS
- RabbitMQ

## Interface

- server(addr, handler): creates an RPC server bound to the address with the handler
- client(addr): creates an RPC client bound to the address and returns a function that can trigger request and waits for callbacks


## Gotchas
 
The server handler should respond with a JSON RPC response meaning an Object with a result and an error property (no node style error passing here)
The client will get the node style error handling for the server response meaning the error will be passed forst and the result second.

## License

MIT © [Haithem Bel Haj](https://github.com/haithembelhaj)

