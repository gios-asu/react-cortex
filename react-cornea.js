import React from 'react';
import {render} from 'enzyme';
import phantom from 'phantom';
import imageDiff from 'image-diff';
import fs from 'fs';
import fileExists from 'file-exists';
import gm from 'gm';

let imagemagick = gm.subClass({ imageMagick: true });

const renderHtml = (component, css) => {
  const wrapper = render(component);
  let html = wrapper.html();

  let styles = '<style>' + css + '</style>'; 

  html = '<html><head>' + styles + '</head><body>' + html + '</body></html>'; 

  return html;
}

const createScreenshot = ({ resolve, reject, componentName, html, ref, path, css, viewportSize }) => {
  phantom.create().then((ph) => {
    ph.createPage().then((page) => {
      page.property('viewportSize', viewportSize).then(() => {
        page.property('content', html).then(() => {
          // TODO figure out a better way to do this
          setTimeout(() => {
            let fullFileName = path + 'yours-' + componentName + '.png';
            page.render(fullFileName).then((e) => {
              ph.exit();
              ref.currentSnap = fullFileName;
              resolve(ref);
            });
          }, 1000);
        })
      });
    })
  });
};

const Differ = function ({
    componentName,
    component,
    savePath,
    viewportSize = { width: 1440, height: 900 },
    css = '',
    threshold = 0,
    onScreenshotsUpdated = () => {},
    updateSnapshots = false
}) {
  this.currentSnap = null;
  this.currentDiff = null;
  this.html        = renderHtml(component, css);

  this.snap = ({ path = './' }) => {
    let promise = new Promise((resolve, reject) => {
      createScreenshot({
        resolve,
        reject,
        componentName,
        html: this.html,
        path,
        ref: this,
        viewportSize
      });
    });
    
    return promise;   
  };

  this.compareTo = ({ path, filename }) => {
    let promise = new Promise((resolve, reject) => {
      this.currentDiff = path + 'difference.png';
      imageDiff({
        actualImage: path + filename,
        expectedImage: this.currentSnap,
        diffImage: path + 'difference.png',
        threshold
      }, function (err, imagesAreSame) {
        imagemagick().command('composite') 
          .in("-gravity", "center")
          .in(path + 'difference.png')
          .in(this.currentSnap)
          .write(path + 'difference.png', function (err) {
            resolve(imagesAreSame);
          });
      }.bind(this));
    });

    return promise;
  }

  this.moveSnapshot = ({ path, filename }) => {
    fs.renameSync( this.currentSnap, path + filename );

    return true;
  };

  this.cleanup = () => {
    if ( fileExists( this.currentSnap ) ) {
      fs.unlinkSync( this.currentSnap );
    }

    if ( fileExists( this.currentDiff ) ) {
      fs.unlinkSync( this.currentDiff );
    }
  }

  this.compare = () => {
    var promise = new Promise((resolve, reject) => {
      this.snap( { path: savePath } ).then((differ) => {
        differ.compareTo( { path: savePath, filename: 'theirs-' + componentName + '.png' } ).then((areTheSame) => {
          if (process.env.UPDATE_SNAPSHOTS || updateSnapshots) {
            differ.moveSnapshot({ path: savePath, filename: 'theirs-' + componentName + '.png' });
            differ.cleanup();
            onScreenshotsUpdated();
          } else {
            resolve(areTheSame);
          }
        });
      });
    });

    return promise;
  };
};

export { Differ };
