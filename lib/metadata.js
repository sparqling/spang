exports.retrieveMetadata = (sparql) => {
  metadata = {};
  sparql.split("\n").forEach(line => {
    line = line.trim();
    if(line.startsWith('#')) {
      line = line.substring(1).trim();
      const matched = line.match(/^@(\w+)\s+(.+)$/);
      if(matched) {
        const dataName = matched[1];
        if(dataName == 'param') {
          if(!metadata['param']) metadata['param'] = new Map();
          const paramMatched = matched[2].match(/^\s*(\w+)\s*=\s*(.+)$/);
          if(paramMatched) {
            let value = paramMatched[2];
            if(value.startsWith('"') && value.endsWith('"') ||
               value.startsWith("'") && value.endsWith("'"))
              value = value.substring(1, value.length - 1);
            metadata['param'].set(paramMatched[1], value);
          } else {
            console.warn(`Warning: metadata @${dataName} must be in the form of <name>=<value>`);
          }
        }
        else if(dataName == 'input') {
          if(!metadata['input']) metadata['input'] = [];
          metadata['input'].push(matched[2].split(' ')[0]);
        }
        else if(metadata[dataName]) {
          console.warn(`Warning: metadata @${dataName} duplicates, only the first one will be handled`);
        } else {
          metadata[dataName] = matched[2];
        }
      }
    }
  });
  return metadata;
};
