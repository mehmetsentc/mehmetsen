/** Source fixtures used to lock VF2.3AR contain sizing. */
export const MEDIA_STAGE_FIXTURES = [
  { name: '1920x1080', width: 1920, height: 1080, ratio: 16 / 9 },
  { name: '1080x1920', width: 1080, height: 1920, ratio: 9 / 16 },
  { name: '1080x1080', width: 1080, height: 1080, ratio: 1 },
  { name: '1280x720', width: 1280, height: 720, ratio: 16 / 9 },
] as const

export type ContainedMediaRect = {
  width: number
  height: number
  ratio: number
  sourceRatio: number
  clipped: boolean
}

/**
 * object-fit:contain inside an explicitly sized stage.
 * Rendered ratio matches the source; no edge of the picture is clipped.
 */
export function containedMediaRect(
  sourceW: number,
  sourceH: number,
  stageW: number,
  stageH: number
): ContainedMediaRect {
  const sourceRatio = sourceW / sourceH
  const stageRatio = stageW / stageH
  let width: number
  let height: number
  if (sourceRatio > stageRatio) {
    width = stageW
    height = stageW / sourceRatio
  } else {
    height = stageH
    width = stageH * sourceRatio
  }
  return {
    width,
    height,
    ratio: width / height,
    sourceRatio,
    clipped: false,
  }
}

/** YouTube 16:9 box fitted into the stage (width-first, then height cap). */
export function youtubeFrameBoxSize(stageW: number, maxH: number): ContainedMediaRect {
  const heightFromWidth = stageW * (9 / 16)
  if (heightFromWidth <= maxH) {
    return {
      width: stageW,
      height: heightFromWidth,
      ratio: 16 / 9,
      sourceRatio: 16 / 9,
      clipped: false,
    }
  }
  const width = maxH * (16 / 9)
  return {
    width,
    height: maxH,
    ratio: 16 / 9,
    sourceRatio: 16 / 9,
    clipped: false,
  }
}

/**
 * VF2.3L cover-crop: iframe height = slide height, width = max(100%, h*16/9),
 * then overflow:hidden on the portrait slide. Visible ratio becomes 9:16.
 */
export function vf23lCoverCroppedVisible(viewportW: number, viewportH: number) {
  const iframeHeight = viewportH
  const iframeWidth = Math.max(viewportW, viewportH * (16 / 9))
  return {
    iframeWidth,
    iframeHeight,
    visibleWidth: viewportW,
    visibleHeight: viewportH,
    visibleRatio: viewportW / viewportH,
    sourceRatio: 16 / 9,
    cropped: iframeWidth > viewportW + 0.5,
  }
}
