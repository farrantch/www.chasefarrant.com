const fs = require('node:fs');
const path = require('node:path');
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
  const resumeURL = new URL(career.source, 'https://www.chasefarrant.com').href;
  const profile = data('profile');
  const notes = data('notes').map(note => {
    const article = readArticle(note.source);
    return {
      ...note,
      article,
      directory: `${article.date}_${note.slug}`,
      url: '/' + note.source.replace(/index\.md$/, '')
    };
  });
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

  document('about/intro.txt', `# About Chase

${profile.paragraphs.join('\n\n')}

## What I work on

${bullets(profile.focus)}
`);
  document('about/hobbies.txt', `# Hobbies

${profile.outsideWork}
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

${project.url || project.repository ? '## Read more\n\n' + bullets([
  ...(article ? [`Full writeup: less ~/${directory}/article.txt`] : []),
  ...(project.url ? [`${project.category === 'music' ? 'Listen' : 'Web page'}: open ~/${directory}/page.url`] : []),
  ...(project.repository ? [`GitHub source: open ~/${directory}/github.url`] : [])
]) : 'A public writeup is not available yet.'}
`, project.url?.startsWith('/') ? project.url : '/');
    if (project.url) file(`${directory}/page.url`, project.url);
    if (project.repository) file(`${directory}/github.url`, project.repository);
  }

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

  for (const note of notes) {
    const directory = `notes/${note.directory}`;
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

  files.push({
    path: `home/guest/documents/${resumeName}`,
    data: resumeData,
    uid: 1000, gid: 1000
  });
  files.push({ path: 'usr/local/share/portfolio/resume.url', text: resumeURL + '\n', uid: 0, gid: 0 });
  for (const link of links) file(`${link.directory || 'contact'}/${link.slug}.url`, link.url);
  return { about, projects, notes, career, resumeURL, links, files };
};
