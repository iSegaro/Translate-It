import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { createPageTarget } from './NavigationModels.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'PdfDestinationResolver')

export class PdfDestinationResolver {
  constructor() {
    this._destinationCache = new Map()
    this._pageIndexCache = new Map()
  }

  resolve({ pdfDocument, totalPages, destination }) {
    if (!pdfDocument) return null

    const ctx = Object.freeze({ pdfDocument, totalPages })

    try {
      if (typeof destination === 'number') {
        return this._resolvePageNumber(ctx, destination)
      }

      if (typeof destination === 'string') {
        return this._resolveNamedDestination(ctx, destination)
      }

      if (Array.isArray(destination)) {
        return this._resolveExplicitDestination(ctx, destination)
      }

      return null
    } catch (error) {
      logger.warn('Failed to resolve destination:', error)
      return null
    }
  }

  clearCaches() {
    this._destinationCache.clear()
    this._pageIndexCache.clear()
  }

  _resolvePageNumber(ctx, pageNumber) {
    if (!Number.isInteger(pageNumber)) {
      return null
    }

    if (pageNumber < 1 || pageNumber > ctx.totalPages) {
      return null
    }

    return createPageTarget({ pageNumber })
  }

  async _resolveNamedDestination(ctx, name) {
    if (!name || typeof name !== 'string') {
      return null
    }

    const cacheKey = `named:${name}`
    if (this._destinationCache.has(cacheKey)) {
      return this._destinationCache.get(cacheKey)
    }

    const explicitDest = await ctx.pdfDocument.getDestination(name)
    if (!explicitDest) {
      this._destinationCache.set(cacheKey, null)
      return null
    }

    const target = await this._resolveExplicitDestination(ctx, explicitDest)
    this._destinationCache.set(cacheKey, target)
    return target
  }

  async _resolveExplicitDestination(ctx, destArray) {
    if (!Array.isArray(destArray) || destArray.length < 1) {
      return null
    }

    const pageRef = destArray[0]
    const pageNumber = await this._getPageNumberFromRef(ctx, pageRef)

    if (pageNumber === null) {
      return null
    }

    const params = this._extractDestinationParams(destArray)
    return createPageTarget({ pageNumber, ...params })
  }

  async _getPageNumberFromRef(ctx, pageRef) {
    if (!pageRef) {
      return null
    }

    const cacheKey = `${pageRef.num}:${pageRef.gen}`
    if (this._pageIndexCache.has(cacheKey)) {
      return this._pageIndexCache.get(cacheKey)
    }

    try {
      const pageIndex = await ctx.pdfDocument.getPageIndex(pageRef)
      const pageNumber = pageIndex + 1

      if (pageNumber < 1 || pageNumber > ctx.totalPages) {
        this._pageIndexCache.set(cacheKey, null)
        return null
      }

      this._pageIndexCache.set(cacheKey, pageNumber)
      return pageNumber
    } catch (error) {
      logger.warn('Failed to resolve page index from ref:', error)
      this._pageIndexCache.set(cacheKey, null)
      return null
    }
  }

  _extractDestinationParams(destArray) {
    const zoomType = destArray[1]?.name ?? (typeof destArray[1] === 'string' ? destArray[1] : '')

    let top = null
    let left = null
    let zoom = null

    switch (zoomType) {
      case 'XYZ': {
        const rawLeft = Number(destArray[2])
        const rawTop = Number(destArray[3])
        const rawZoom = Number(destArray[4])
        left = Number.isFinite(rawLeft) ? rawLeft : null
        top = Number.isFinite(rawTop) ? rawTop : null
        zoom = Number.isFinite(rawZoom) ? rawZoom : null
        break
      }

      case 'FitH':
      case 'FitBH': {
        const rawTop = Number(destArray[2])
        top = Number.isFinite(rawTop) ? rawTop : null
        break
      }

      case 'FitV':
      case 'FitBV': {
        const rawLeft = Number(destArray[2])
        left = Number.isFinite(rawLeft) ? rawLeft : null
        break
      }

      case 'Fit':
      case 'FitR':
      default:
        break
    }

    return { top, left, zoom }
  }
}
