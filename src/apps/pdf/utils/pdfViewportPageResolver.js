import { findPrimaryPageGeometry, getPageElements } from './pdfGeometryModel.js'

function findPrimaryPageTarget(container, pageSelector) {
  return findPrimaryPageGeometry(container, pageSelector)
}

function getPrimaryPage(container, pageSelector) {
  return findPrimaryPageTarget(container, pageSelector)?.pageNumber || null
}

export {
  getPageElements,
  findPrimaryPageTarget,
  getPrimaryPage
}
