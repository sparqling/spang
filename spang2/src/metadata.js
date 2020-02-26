exports.retrieveMetadata = (sparql) => {
  metadata = {};
  sparql.split("\n").forEach(line => {
    line = line.trim();
    if(line.startsWith('#')) {
      line = line.substring(1).trim();
      const matched = line.match(/^@(\w+)\s+(.+)$/);
      if(matched) {
        if(matched[1] == 'param') {
          if(!metadata['param']) metadata['param'] = {};
          const paramMatched = matched[2].match(/^\s*(\w+)\s*=\s*(.+)$/);
          if(paramMatched) {
            metadata['param'][paramMatched[1]] = paramMatched[2]
          } else {
            console.warn(`Warning: metadata @${matched[1]} must be in the form of <name>=<value>`);
          }
        }
        else if(metadata[matched[1]]) {
          console.warn(`Warning: metadata @${matched[1]} duplicates, only the first one will be handled`);
        } else {
          metadata[matched[1]] = matched[2];
        }
      }
    }
  });
  return metadata;
};
