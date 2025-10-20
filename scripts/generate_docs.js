const fs = require('node:fs')
const { parse } = require('comment-parser')
const ejs = require('ejs')

const source = fs.readFileSync('src/index.ts', 'utf8')
const parsed = parse(source)

const template = `<div>
<h2><%= method %> <%= name %></h2><% if (types.length > 0) { %>
<p>Content-Type: <%= types.join(' OR ') %></p><% } %>
<p><%= description %></p><% if (params.length > 0) { %>
<p><strong>Parameters:</strong></p>
<ul><% for (const param of params) { %>
<li><%= param.name %>: <%= param.type %> - <%= param.description %></li><% } %>
</ul><% } %>
</div>
`

const generated = ['<h1>Receipt Printer API Documentation</h1>']

for (const docstring of parsed) {
  const description = docstring.description
  const method = (docstring.tags.find(tag => tag.tag === 'method') ?? {}).name
  const types = docstring.tags.filter(tag => tag.tag === 'type').map(tag => tag.name)
  const name = (docstring.tags.find(tag => tag.tag === 'route') ?? {name: 'unspecified'}).name
  const params = docstring.tags.filter(tag => tag.tag === 'param')
  generated.push(ejs.render(template, {name, method, types, description, params}))
}

fs.writeFileSync('gen/docs/index.html', generated.join('\n'))
