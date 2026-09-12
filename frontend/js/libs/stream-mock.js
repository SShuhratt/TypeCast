const EventEmitter = require('events');

class Readable extends EventEmitter {
  constructor() {
    super();
    this._started = false;
  }

  push(chunk) {
    if (chunk === null) {
      queueMicrotask(() => {
        this.emit('end');
      });
      return false;
    }
    queueMicrotask(() => {
      this.emit('data', chunk);
    });
    return true;
  }

  on(event, listener) {
    super.on(event, listener);
    if (event === 'data' && !this._started) {
      this._started = true;
      queueMicrotask(() => this._runLoop());
    }
    return this;
  }

  async _runLoop() {
    while (!this._done) {
      try {
        const ret = this._read();
        if (ret && typeof ret.then === 'function') {
          await ret;
        }
      } catch (err) {
        this.emit('error', err);
        break;
      }
    }
  }

  _read() {}
}

module.exports = { Readable };
