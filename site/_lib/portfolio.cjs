const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { terminalText } = require('./terminal-text.cjs');
const site = path.resolve(__dirname, '..');
const data = name => JSON.parse(fs.readFileSync(path.join(site, '_data', name + '.json'), 'utf8'));

function readArticle(name) {
  const raw = fs.readFileSync(path.join(site, name), 'utf8');
  const metadata = {};
  const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  for (const line of (frontmatter?.[1] || '').split('\n')) {
    const match = line.match(/^([\w_]+):\s*(.*?)\s*$/);
    if (match) metadata[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  const markdown = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\s*/, '')
    .replace(/{{\s*title\s*}}/g, metadata.title || name)
    .replace(/{{\s*(date_created|date_updated)\s*}}/g, (_, key) => metadata[key] || '')
    .replace(/{{\s*page.date\s*\|\s*asPostDate\s*}}/g, metadata.date || '')
    .replace(/{%\s*gallery\b[\s\S]*?{%\s*endgallery\s*%}/g, '')
    .replace(/{%\s*(?:raw|endraw)\s*%}/g, '');
  return { markdown, date: metadata.date || metadata.date_created || '', title: metadata.title || name };
}

module.exports = function portfolio() {
  // Explicit catalogs keep unfinished pages and duplicate drafts out of the VM.
  const projects = data('catalog');
  const career = data('career');
  const resumeName = path.posix.basename(career.source);
  const resumeData = fs.readFileSync(path.join(site, career.source.slice(1)));
  const resumeURL = `${career.source}?v=${createHash('sha256').update(resumeData).digest('hex').slice(0, 12)}`;
  const profile = data('profile');
  const notes = data('notes').map(note => ({
    ...note,
    article: readArticle(note.source),
    url: '/' + note.source.replace(/index\.md$/, '')
  }));
  const about = [...profile.paragraphs, profile.outsideWork].join('\n\n');
  const links = [
    { slug: 'email', title: 'Email', url: 'mailto:hello@chasefarrant.com', label: 'hello@chasefarrant.com' },
    { slug: 'github', title: 'GitHub', url: 'https://github.com/farrantch', label: 'github.com/farrantch' },
    { slug: 'linkedin', title: 'LinkedIn', url: 'https://www.linkedin.com/in/chase-f-58399b65/', label: 'Connect on LinkedIn' },
    { slug: 'meeting', title: 'Meet', url: 'https://cal.com/chasefarrant/meetandgreet', label: 'Schedule a conversation' },
    { slug: 'resume', title: 'Résumé', url: resumeURL, download: resumeName, label: 'Download my résumé (PDF)' }
  ];
  const files = [];
  const file = (name, text) => files.push({ path: `home/guest/${name}`, text: text.trimEnd() + '\n', uid: 1000, gid: 1000 });
  const document = (name, markdown, url) => file(name, terminalText(markdown, url));
  const bullets = lines => lines.map(line => '- ' + line).join('\n');

  document('about/readme.txt', `# About Chase

${profile.paragraphs.join('\n\n')}

## What I work on

${bullets(profile.focus)}

## Outside work

${profile.outsideWork}

## More

- Work history: less ~/career/overview.txt
- Get in touch: cat ~/contact/readme.txt
`);

  const categories = ['software', 'infrastructure', 'electronics', 'home', 'music'];
  const groups = categories.map(category => {
    const entries = projects.filter(project => project.category === category);
    return `## ${entries[0].categoryLabel}\n\n` + entries.map(project =>
      `- ${project.slug}/ — ${project.description}`
    ).join('\n');
  });
  document('projects/readme.txt', `# Projects

${projects.length} projects across software, infrastructure, electronics, home builds, and music.

Each project has a readme.txt with its status, tools, and links to further reading. For example: cat ~/projects/website/readme.txt

${groups.join('\n\n')}
`);
  for (const project of projects) {
    const directory = `projects/${project.slug}`;
    let article;
    if (project.url?.startsWith('/projects/')) {
      article = readArticle(project.url.slice(1) + 'index.md');
      document(`${directory}/article.txt`, article.markdown, project.url);
    }
    document(`${directory}/readme.txt`, `# ${project.title}

${[project.categoryLabel, project.year, project.status].filter(Boolean).join(' | ')}

${project.description}

## Details

${bullets(project.highlights)}

Tools / materials: ${project.materials.join(', ')}.

${project.url ? '## Read more\n\n' + bullets([
  ...(article ? [`Full writeup: less ~/${directory}/article.txt`] : []),
  `${project.external ? (project.category === 'music' ? 'Listen' : 'Repository') : 'Web page and images'}: open ~/${directory}/page.url`
]) : 'A public writeup is not available yet.'}
`, project.url?.startsWith('/') ? project.url : '/');
    if (project.url) file(`${directory}/page.url`, project.url);
  }

  document('career/overview.txt', `# Career

${career.note}

Each employer directory has role.txt for context, work.txt for detailed work, and tools.txt for the technical stack.

${career.roles.map(role => `${role.company}  \n${role.title}  \n${role.dates}  \n${role.summary}  \nExplore: ls ~/career/'${role.directory}'/`).join('\n\n')}

## Full résumé

open ~/documents/${resumeName}
`);
  for (const role of career.roles) {
    const directory = `career/${role.directory}`;
    const sections = role.sections.map(section => `## ${section.heading}

${section.dates ? section.dates + '\n\n' : ''}${bullets(section.items)}`).join('\n\n');
    document(`${directory}/role.txt`, `# ${role.company}

${role.title}

${role.dates}  
${role.location}

${role.summary}

${role.history ? '## Company history\n\n' + role.history : ''}
`);
    document(`${directory}/work.txt`, `# Work

${role.company}  
${role.dates}

${sections}
`);
    document(`${directory}/tools.txt`, `# Tools

${role.company}  
${role.dates}

${bullets(role.tools)}
`);
  }

  document('notes/readme.txt', `# Notes

Writing about infrastructure and software design. Each directory has a short overview, the original article, and a link to the web version.

${notes.map(note => `## ${note.title}\n\n${note.article.date}\n\n${note.description}\n\nRead: cat ~/notes/${note.slug}/readme.txt`).join('\n\n')}
`);
  for (const note of notes) {
    const directory = `notes/${note.slug}`;
    document(`${directory}/readme.txt`, `# ${note.title}

Published ${note.article.date}

${note.description}

## In brief

${bullets(note.highlights)}

## Full article

- Read here: less ~/${directory}/article.txt
- Read on the web: open ~/${directory}/page.url
`, note.url);
    document(`${directory}/article.txt`, note.article.markdown, note.url);
    file(`${directory}/page.url`, note.url);
  }

  document('contact/readme.txt', `# Contact

Email is the simplest way to reach me about a project or get in touch.

## Email

hello@chasefarrant.com

open ~/contact/email.url

## Elsewhere

- GitHub: github.com/farrantch — open ~/contact/github.url
- LinkedIn: open ~/contact/linkedin.url
- Schedule a conversation: open ~/contact/meeting.url
- Résumé (PDF): open ~/contact/resume.url

The open command prints a clickable link. Click it to open in your browser.
`);
  files.push({
    path: `home/guest/documents/${resumeName}`,
    data: resumeData,
    uid: 1000, gid: 1000
  });
  files.push({ path: 'usr/local/share/portfolio/resume.url', text: resumeURL + '\n', uid: 0, gid: 0 });
  for (const link of links) file(`${link.directory || 'contact'}/${link.slug}.url`, link.url);
  return { about, projects, notes, career, resumeURL, links, files };
};
