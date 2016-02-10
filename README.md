[![Build Status](https://travis-ci.org/micro-node/amqp.svg)](http://travis-ci.org/micro-node/amqp)
# AMQP RPC Helper

This is a slim implementation of RPC calls using AMQP.

## Requirements

- NodeJS
- RabbitMQ

## Interface

- server(addr, handler): creates an RPC server bound to the address with the handler
- client(addr): creates an RPC client bound to the address and returns a function that can trigger request and waits for callbacks 

