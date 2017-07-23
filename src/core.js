'use strict';

var asap = require('asap/raw');

function noop() {}

// States:
//
// 0 - pending
// 1 - fulfilled with _value
// 2 - rejected with _value
// 3 - adopted the state of another promise, _value 传递给另外一个promise
//
// once the state is no longer pending (0) it is immutable(不可改变的)

// All `_` prefixed properties will be reduced to `_{random number}`
// at build time to obfuscate them and discourage their use.
// We don't use symbols or Object.defineProperty to fully hide them
// because the performance isn't good enough.

// 所有的以 _ 开头的变量都会在 构建时 被 混淆成  _xxx 的形式来保证这些变量不被使用.
// 我们不用 符号 或者是 Object.defineProperty 去完全隐藏他们，是因为这样的话性能表现不够好。

// question: 为什么会不够好？


// to avoid using try/catch inside critical functions, we
// extract them to here.

// to avoid using try/catch inside critical functions, we extract them to here.

var LAST_ERROR = null;
var IS_ERROR = {};


function getThen(obj) {
  try {
    return obj.then;
  } catch (ex) {
    LAST_ERROR = ex;
    return IS_ERROR;
  }
}

function tryCallOne(fn, a) {
  try {
    return fn(a);
  } catch (ex) {
    LAST_ERROR = ex;
    return IS_ERROR;
  }
}

function tryCallTwo(fn, a, b) {
  // 将a,b作为参数传递给fn，实际上就是fn里面的函数执行了就调用a和b而已.
  try {
    fn(a, b);
  } catch (ex) {
    LAST_ERROR = ex;
    return IS_ERROR;
  }
}

module.exports = Promise;

function Promise(fn) {
  // 判断是否是通过对象创建的
  if (typeof this !== 'object') {
    throw new TypeError('Promises must be constructed via new');
  }
  
  // 只接受一个 function 作为参数
  if (typeof fn !== 'function') {
    throw new TypeError('Promise constructor\'s argument is not a function');
  }

  // 某些变量
  this._deferredState = 0;
  this._state = 0;
  this._value = null;
  this._deferreds = null;

  // 传入的是空函数
  if (fn === noop) return;
  doResolve(fn, this);
}

Promise._onHandle = null;
Promise._onReject = null;
Promise._noop = noop;

Promise.prototype.then = function(onFulfilled, onRejected) {
  if (this.constructor !== Promise) {
    return safeThen(this, onFulfilled, onRejected);
  }
  var res = new Promise(noop);
  // Handler 的作用就是新开辟一个内存来存放这三个变量，以避免他们被释放
  handle(this, new Handler(onFulfilled, onRejected, res));
  return res;
};

function safeThen(self, onFulfilled, onRejected) {
  return new self.constructor(function (resolve, reject) {
    var res = new Promise(noop);
    res.then(resolve, reject);
    handle(self, new Handler(onFulfilled, onRejected, res));
  });
}


function handle(self, deferred) {
  
  console.log(self._state);

  while (self._state === 3) {
    self = self._value;
  }

  // 暂时不知道是干嘛的，可以回头去看一下test的文件
  if (Promise._onHandle) {
    Promise._onHandle(self);
  }

  if (self._state === 0) {
    if (self._deferredState === 0) {
      self._deferredState = 1;
      self._deferreds = deferred;
      return;
    }

    if (self._deferredState === 1) {
      self._deferredState = 2;
      self._deferreds = [self._deferreds, deferred];
      return;
    }
    self._deferreds.push(deferred);
    return;
  }

  handleResolved(self, deferred);
}

function handleResolved(self, deferred) {
  asap(function() {
    var cb = self._state === 1 ? deferred.onFulfilled : deferred.onRejected;
    if (cb === null) {
      if (self._state === 1) {
        resolve(deferred.promise, self._value);
      } else {
        reject(deferred.promise, self._value);
      }
      return;
    }
    
    var ret = tryCallOne(cb, self._value);
    if (ret === IS_ERROR) {
      reject(deferred.promise, LAST_ERROR);
    } else {
      resolve(deferred.promise, ret);
    }
  });
}

function resolve(self, newValue) {
  // Promise Resolution Procedure: https://github.com/promises-aplus/promises-spec#the-promise-resolution-procedure
  // 
  if (newValue === self) {
    return reject(
      self,
      new TypeError('A promise cannot be resolved with itself.')
    );
  }

  console.log(typeof newValue);
  // 这里为什么要把 object 和 function 分开出来处理

  if (
    newValue &&
    (typeof newValue === 'object' || typeof newValue === 'function')
  ) {
    var then = getThen(newValue);
    if (then === IS_ERROR) {
      console.log('i am here');
      return reject(self, LAST_ERROR);
    }
    if (
      then === self.then &&
      newValue instanceof Promise
    ) {
      self._state = 3;
      self._value = newValue;
      finale(self);
      return;
    } else if (typeof then === 'function') {
      doResolve(then.bind(newValue), self);
      return;
    }
  }

  self._state = 1;
  self._value = newValue;
  finale(self);
}

function reject(self, newValue) {
  self._state = 2;
  self._value = newValue;
  if (Promise._onReject) {
    Promise._onReject(self, newValue);
  }
  finale(self);
}


function finale(self) {
  //
  if (self._deferredState === 1) {
    handle(self, self._deferreds);
    self._deferreds = null;
  }
  if (self._deferredState === 2) {
    for (var i = 0; i < self._deferreds.length; i++) {
      handle(self, self._deferreds[i]);
    }
    self._deferreds = null;
  }
}

function Handler(onFulfilled, onRejected, promise){
  this.onFulfilled = typeof onFulfilled === 'function' ? onFulfilled : null;
  this.onRejected = typeof onRejected === 'function' ? onRejected : null;
  this.promise = promise;
}

/**
 * Take a potentially misbehaving resolver function and make sure
 * onFulfilled and onRejected are only called once.
 *
 * Makes no guarantees about asynchrony.
 * 
 * 采取潜在的行为不正确的解析器功能，并确保onFulfilled和onRejected仅被调用一次。不保证不同步。
 */
function doResolve(fn, promise) {
  var done = false;
  var res = tryCallTwo(fn, function (value) {
    if (done) return;
    done = true;
    resolve(promise, value);
  }, function (reason) {
    if (done) return;
    done = true;
    reject(promise, reason);
  });

  // 如果没有执行完成，并且 res 是错误，那么就抛出错误
  if (!done && res === IS_ERROR) {
    done = true;
    reject(promise, LAST_ERROR);
  }

}
