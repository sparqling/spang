# SPANG
`spang2` is a commmand-line SPARQL client implemented in JavaScript.

## Installation
`spang2` requires `node` (version >= 14).
```
node -v
```
If you have installed it, skip installation of `node`.

### Installation of `node` on Ubuntu
If you do not have `npm`, install it.
```
sudo apt install -y npm
```
The defualt directory for modules is `/usr/local/`, which requires `sudo`.
Configure the directory.
```
npm set prefix ~/.npm-global
```
The configuration is saved in `~/.npmrc`, so you can also configure by editing it.

Install `n` to manage `node` version.
```
npm install -g n
n stable
node -v
```

### Installation of `node` on Mac
If you do not have `brew`, install it.
```
brew -v
```
```
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```
Install `nodebrew` using `brew`.
```
brew install nodebrew
mkdir -p ~/.nodebrew/src
export PATH=$HOME/.nodebrew/current/bin:$PATH
```
Now you can use `node`. Check the version.
```
node -v
```

### Installation of spang
Download from GitHub.
```
git clone https://github.com/hchiba1/spang.git
```

Install.
```
cd spang
npm install
npm link
```

## Using SPARQL client
For the help message, just type the command
```
spang2
```

### Test examples
```
npm test
```

## Using SPARQL formatter

### Usage in command line

```
$ cat messy.rq 
SELECT * WHERE         {         ?s ?p ?o }

$ spfmt messy.rq 
SELECT *
WHERE {
    ?s ?p ?o .
}
```

### Usage on a web site

See: https://github.com/sparqling/sparql-formatter

An example web site:<br>
https://spang.dbcls.jp/example.html

* Download `spfmt.js` and use it in your HTML.

```
<script src="/js/spfmt.js"></script>
```

* Then you can use `spfmt`.
```javascript
spfmt("SELECT * WHERE {?s ?p ?o}");
/*
SELECT *
WHERE {
  ?s ?p ?o .
}
*/
```

* You can also call `spfmt.js` through the jsDelivr service.
```
    <textarea id="sparql-text" rows=5></textarea>
    <button id="reformat-button">Reformat</button>
    <textarea id="sparql-text-after" rows=5></textarea>
    
    <script src="https://cdn.jsdelivr.net/gh/sparqling/spang@master/js/spfmt.js"></script>
    <script type="text/javascript">
     window.onload = () => {
         var textArea = 
             document.querySelector("#reformat-button").addEventListener('click', (event) => {
                 document.querySelector("#sparql-text-after").value =
                     spfmt(document.querySelector("#sparql-text").value);
             });
     };
    </script>
```

## For maintainers

`js/*.js` should be updated for those who call spang functions through their Web applications.

* `js/spang.js` should be updated after modifying codes.
* `js/spfmt.js` should be updated after modifying parser or formatter codes.

Update the `js/*.js` by converting codes using `browserify` as follows.
```
npm run browserify
```

### Requirements
- npm (>= 6.12.0)

## SPARQL specifications

### Syntax
The EBNF notation of SPARQL is extracted from:<br>
https://www.w3.org/TR/sparql11-query/#sparqlGrammar

The PEG expression of SPARQL grammer was originally provided by:<br>
https://github.com/antoniogarrote/rdfstore-js/

PEG can be tested at:<br>
https://pegjs.org/online

### Medadata
[sparql-doc](https://github.com/ldodds/sparql-doc)
```
# @title Get orthololog from MBGD
# @author Hirokazu Chiba
# @tag ortholog
# @endpoint http://sparql.nibb.ac.jp/sparql
```
extension
```
# @prefixes https://
# @input_class id:Taxon
# @output_class up:Protein
# @param gene=
```
