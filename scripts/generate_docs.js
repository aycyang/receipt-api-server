const fs = require('node:fs')
const { parse } = require('comment-parser')
const ejs = require('ejs')

const source = fs.readFileSync('src/index.ts', 'utf8')
const parsed = parse(source)

const template = `<div>
<h3><%= name %></h3>
<p><%= description %></p>
<ul><% for (const param of params) { %>
<li><%= param.name %>: <%= param.type %> - <%= param.description %></li><% } %>
</ul>
</div>
`

const generated = []

for (const docstring of parsed) {
  console.log(docstring)
  const description = docstring.description
  const name = (docstring.tags.find(tag => tag.tag === 'route') ?? {name: 'unspecified'}).name
  const params = docstring.tags.filter(tag => tag.tag === 'param')
  generated.push(ejs.render(template, {name, description, params}))
}

fs.writeFileSync('gen/docs/index.html', generated.join('\n'))
