import {
  GroundTruthValidationError,
  createGroundTruthLookup,
  loadGroundTruthCases
} from './groundTruthLoader.js'

function error(code, path, message, details) {
  return details === undefined ? { code, path, message } : { code, path, message, details }
}

function sortErrors(errors) {
  return errors.sort((left, right) => (
    left.path.localeCompare(right.path) || left.code.localeCompare(right.code) || left.message.localeCompare(right.message)
  ))
}

function truthAssetsByPath(assets) {
  const result = new Map()
  assets.filter(asset => asset?.kind === 'ground-truth').forEach((asset) => {
    const matches = result.get(asset.path) || []
    matches.push(asset)
    result.set(asset.path, matches)
  })
  return result
}

function validateTruthAssets(corpus, assetsByPath) {
  const errors = []
  const manifest = corpus?.manifest || corpus

  ;(manifest?.documents || []).forEach((document, documentIndex) => {
    ;(document.regions || []).forEach((region, regionIndex) => {
      const path = `$.documents[${documentIndex}].regions[${regionIndex}].groundTruth`
      const truthPath = region.groundTruth?.path
      const matches = assetsByPath.get(truthPath) || []
      if (matches.length === 0) {
        errors.push(error('missing_ground_truth', path, 'Reviewed ground truth asset is missing', {
          documentId: document.id,
          regionId: region.id,
          path: truthPath
        }))
      } else if (matches.length > 1) {
        errors.push(error('duplicate_ground_truth_asset', path, 'Reviewed ground truth asset must be unique', {
          documentId: document.id,
          regionId: region.id,
          path: truthPath
        }))
      } else if (typeof matches[0].text !== 'string') {
        errors.push(error('invalid_ground_truth_text', path, 'Reviewed ground truth asset must contain UTF-8 text', {
          documentId: document.id,
          regionId: region.id,
          path: truthPath
        }))
      }
    })
  })

  if (errors.length > 0) throw new GroundTruthValidationError(sortErrors(errors))
}

export async function loadBrowserGroundTruthCases({ corpus, assets } = {}) {
  if (!corpus) throw new TypeError('loadBrowserGroundTruthCases requires corpus')
  if (!Array.isArray(assets)) throw new TypeError('loadBrowserGroundTruthCases requires assets')

  const assetsByPath = truthAssetsByPath(assets)
  validateTruthAssets(corpus, assetsByPath)
  return loadGroundTruthCases({
    corpus,
    loadText({ groundTruth }) {
      return assetsByPath.get(groundTruth.path)[0].text
    }
  })
}

export async function loadBrowserGroundTruthLookup(input) {
  return createGroundTruthLookup(await loadBrowserGroundTruthCases(input))
}
