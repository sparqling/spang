exports.retrieveMetadata = (sparql) => {
  let metadata = {};

  sparql.split("\n").forEach(line => {
    if (line.startsWith('#')) {
      const matched = line.substring(1).trim().match(/^@(\w+)\s+(.+)$/);
      if (matched) {
        const name = matched[1];
        const value = matched[2];
        if (name === 'param') {
          if (!metadata['param']) {
            metadata['param'] = new Map();
          }
          const param = value.match(/^\s*(\w+)\s*=\s*(.+)$/);
          if (param) {
            const par = param[1];
            let val = param[2];
            if (val.startsWith('"') && val.endsWith('"') ||
                val.startsWith("'") && val.endsWith("'")) {
              val = val.substring(1, val.length - 1);
            }
            metadata['param'].set(par, val);
          } else {
            console.warn(`Warning: metadata @param must be in the form of <par>=<val>`);
          }
        } else if (name === 'input') {
          if (!metadata['input']) {
            metadata['input'] = [];
          }
          metadata['input'].push(value);
        } else if (metadata[name]) {
          // console.warn(`Warning: metadata @${name} duplicates, only the first one will be handled`);
        } else {
          metadata[name] = value;
        }
      }
    }
  });

  return metadata;
};
