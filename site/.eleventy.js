const { DateTime } = require("luxon");

const sharp = require('sharp');

const GALLERY_IMAGE_WIDTH = 192;
const LANDSCAPE_LIGHTBOX_IMAGE_WIDTH = 2000;
const PORTRAIT_LIGHTBOX_IMAGE_WIDTH = 720;

function galleryShortcode(content, name) {
    return `
        <div>
            <div class="gallery" id="gallery-${name}">
                ${content}
            </div>
            <script type="module">
                import PhotoSwipeLightbox from '/js/photoswipe-lightbox.esm.min.js';
                import PhotoSwipe from '/js/photoswipe.esm.min.js';
                const lightbox = new PhotoSwipeLightbox({
                    gallery: '#gallery-${name}',
                    children: 'a',
                    pswpModule: PhotoSwipe,
                    preload: [1, 1]
                });
                lightbox.init();
            </script>
        </div>
    `.replace(/(\r\n|\n|\r)/gm, "");
}

async function galleryImageShortcode(src, alt) {
    const { default: Image } = await import('@11ty/eleventy-img');
    let lightboxImageWidth = LANDSCAPE_LIGHTBOX_IMAGE_WIDTH;

    const metadata = await sharp(src).metadata();
    if(metadata.height > metadata.width) {
        lightboxImageWidth = PORTRAIT_LIGHTBOX_IMAGE_WIDTH;
    }

    const options = {
        formats: ['jpeg'],
        widths: [GALLERY_IMAGE_WIDTH, lightboxImageWidth],
        urlPath: "/gen/",
        outputDir: './_site/gen/'
    }

    const genMetadata = await Image(src, options);

    return `
        <a href="${genMetadata.jpeg[1].url}" 
        data-pswp-width="${genMetadata.jpeg[1].width}" 
        data-pswp-height="${genMetadata.jpeg[1].height}" 
        target="_blank">
            <img src="${genMetadata.jpeg[0].url}" alt="${alt}" width="${genMetadata.jpeg[0].width}" height="${genMetadata.jpeg[0].height}" loading="lazy" decoding="async" />
        </a>
    `.replace(/(\r\n|\n|\r)/gm, "");;
}

module.exports = function(eleventyConfig) {
    eleventyConfig.addGlobalData('vm', () => require('../scripts/build-vm.cjs')());
    eleventyConfig.addWatchTarget('../vm/overlay');
    eleventyConfig.addWatchTarget('../scripts');
    eleventyConfig.addWatchTarget('favicon.svg');
    eleventyConfig.on('eleventy.before', () => require('../scripts/build-favicons.cjs')());
    eleventyConfig.addTransform('native-image-loading', function (content) {
      if (!this.outputPath?.endsWith('.html')) return content;
      return content.replace(/<img\b[^>]*>/gi, tag => {
        if (!/\bloading=/.test(tag)) tag = tag.replace('<img', '<img loading="lazy"');
        if (!/\bdecoding=/.test(tag)) tag = tag.replace('<img', '<img decoding="async"');
        return tag;
      });
    });
    eleventyConfig.addPassthroughCopy('blog/**/*.webp')
    eleventyConfig.addPassthroughCopy('projects/**/*.webp')
    eleventyConfig.addPassthroughCopy('blog/**/*.jpg')
    eleventyConfig.addPassthroughCopy('projects/**/*.jpg')
    eleventyConfig.addPassthroughCopy('error')
    eleventyConfig.addPassthroughCopy('css')
    eleventyConfig.addPassthroughCopy('js')
    eleventyConfig.addPassthroughCopy('fonts')
    eleventyConfig.addPassthroughCopy('ChaseFarrant-Resume.pdf')
    eleventyConfig.addWatchTarget('ChaseFarrant-Resume.pdf')
    // Add folders to watch for changes
    eleventyConfig.addWatchTarget('blog')
    eleventyConfig.addWatchTarget('projects')

    eleventyConfig.addFilter("asPostDate", (dateObj) => {
      return DateTime.fromJSDate(dateObj).toLocaleString(DateTime.DATE_FULL);
     });

    eleventyConfig.addFilter("jsonify", (value) => JSON.stringify(value, null, 2).replace(/</g, '\\u003c'));

    eleventyConfig.addTransform('favicon-version', function (content) {
      if (!this.outputPath || !this.outputPath.endsWith('.html')) return content;
      const version = require('node:crypto').createHash('sha256')
        .update(require('node:fs').readFileSync('favicon.svg')).digest('hex').slice(0, 12);
      return content.replace(/href="\/(favicon\.(?:svg|ico)|apple-touch-icon\.png)"/g,
        (_, file) => `href="/${file}?v=${version}"`);
    });

    eleventyConfig.addTransform('external-links', function (content) {
      if (this.outputPath && this.outputPath.endsWith('.html')) {
        return require('./_lib/external-links')(content);
      }
      return content;
    });

    eleventyConfig.addFilter("bust", (url) => {
      const [urlPart, paramPart] = url.split("?");
      const params = new URLSearchParams(paramPart || "");
      const fs = require('node:fs');
      const path = require('node:path');
      const file = path.join(__dirname, urlPart.replace(/^\//, ''));
      params.set("v", require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 12));
      return `${urlPart}?${params}`;
    });

    // Image Gallery Viewerf
    eleventyConfig.addPairedLiquidShortcode('gallery', galleryShortcode)
    eleventyConfig.addLiquidShortcode('galleryImage', galleryImageShortcode)
    
    return {
      passthroughFileCopy: true
    }
}
