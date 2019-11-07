# spfmt
A reformatter of SPARQL written in JS

## Requirements
- Node.js (>= 11.0.0)
- npm (>= 6.12.0)

## Installation
```
$ npm install
$ npm link
```

## Usage
```
$ cat messy.rq 
SELECT * WHERE         {         ?s ?p ?o }

$ spfmt messy.rq 
SELECT *
WHERE {
    ?s ?p ?o .
}
```

## Test
```
$ mocha
```
