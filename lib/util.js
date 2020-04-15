String.prototype.insert = function(idx, val) {
  return this.substring(0, idx) + val + this.substring(idx);
};

String.prototype.remove = function(start, end){
  return this.substring(0, start) + this.substring(end);
};

traverse = (o, fn) => {
  for (const i in o) {
    fn.apply(this,[i,o[i]]);  
    if (o[i] !== null && typeof(o[i])=="object") {
      traverse(o[i], fn);
    }
  }
}

exports.traverse = traverse;
