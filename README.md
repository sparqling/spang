# SPANG

Website: http://purl.org/spang

npm: https://www.npmjs.com/package/spang

Docker: https://hub.docker.com/r/sparqling/spang

## Command line interface
```
$ npm install -g spang
```
A symbolic link to `./bin/spang.js` will be created as `spang2` in your path.

For the help message, just type the command
```
$ spang2
```

## Install from GitHub
```
git clone https://github.com/sparqling/spang
cd spang
npm ci
```
Optional:
```
$ npm link
```
will make a symbolic link to `./bin/*` in your path.

## Installation of `node`
`spang2` requires `node` (version >= 14).
```
node -v
```
If you do not have `node`, install it as follows.

### Linux
If you do not have `npm`, install it.
```
sudo apt -y install npm
```
on Ubuntu, or
```
sudo yum -y install npm
```
on CentOS.

The defualt directories for installation of npm modules are under `/usr/local/`, which requires `sudo`.

You can change the directories as follows.
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

### Mac
If you do not have `brew`, install it.
```
brew -v
```
```
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```
Install `node` or `nodebrew` using `brew`.
```
brew install node
```
```
brew install nodebrew
mkdir -p ~/.nodebrew/src
export PATH=$HOME/.nodebrew/current/bin:$PATH
```
Now you can use `node`. Check the version.
```
node -v
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

### Test
```
npm test
```

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
