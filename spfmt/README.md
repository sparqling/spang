# spfmt
A reformatter of SPARQL written in JS

## Usage for Web Browser

* Download spfmt_bundled.js and load it in your HTML.

```
<script src="/js/spfmt_bundled.js"></script>
```

* Then you can use `spfmt.reformat`
```javascript
spfmt.reformat("SELECT * WHERE {?s ?p ?o}");
/*
SELECT *
WHERE {
    ?s ?p ?o .
}
*/
```

## Usage from Command line

### Requirements
- Node.js (>= 11.0.0)
- npm (>= 6.12.0)

### Installation
```
$ npm install
$ npm link
```

### Usage
```
$ cat messy.rq 
SELECT * WHERE         {         ?s ?p ?o }

$ spfmt messy.rq 
SELECT *
WHERE {
    ?s ?p ?o .
}
```

### Test
```
$ mocha
```

### Create bundled js
```
$ ./node_modules/browserify/bin/cmd.js spfmt_browser.js > spfmt_bundled.js 
```
