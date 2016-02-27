module.exports = fibonacci;

function fibonacci(req, callback){

  // avoid stack overflow with tail recursion
  return function fib(n, a, b) {

    return n > 0 ? fib(n-1, b, a + b) : callback({result:a});

  }(req.params[0], 0, 1);
}