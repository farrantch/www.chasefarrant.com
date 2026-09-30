---
description: Projects and experiments by Chase Farrant, from software and infrastructure to electronics and home builds.
layout: layouts/base.njk
title: Project index
---

# Project index

Software, infrastructure, electronics, and things I build along the way. Browse the records here, or [return to the terminal](/).

{% for project in catalog %}
## {% if project.url %}[{{ project.title }}]({{ project.url }}){% else %}{{ project.title }}{% endif %}

{{ project.year }} · {{ project.categoryLabel }} · {{ project.status }}

{{ project.description }}

{% unless project.url %}Working notes are not published yet.{% endunless %}
{% endfor %}

## More from the archive

<ul>
  {%- assign catalog_urls = catalog | map: 'url' -%}
  {%- for project in collections.projects reversed -%}
    {%- unless catalog_urls contains project.url -%}
      <li><a href="{{ project.url }}">{{ project.data.title }}</a></li>
    {%- endunless -%}
  {%- endfor -%}
</ul>
