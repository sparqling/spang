exports.retrieveMetadata = (sparql) => {
  metadata = {};
  sparql.split("\n").forEach(line => {
    line = line.trim();
    if(line.startsWith('#')) {
      line = line.substring(1).trim();
      const matched = line.match(/^@(\w+)\s+(.+)$/);
      if(matched) {
        if(metadata[matched[1]]) {
          console.warn(`Warning: metadata @${matched[1]} duplicates, only the first one will be handled`);
        } else {
          metadata[matched[1]] = matched[2];
        }
      }
    }
  });
  return metadata;
};
