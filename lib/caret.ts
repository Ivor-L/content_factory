
export interface Coordinates {
  top: number;
  left: number;
  height: number;
}

const properties = [
  'direction',
  'boxSizing',
  'width',
  'height',
  'overflowX',
  'overflowY',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStyle',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'fontSizeAdjust',
  'lineHeight',
  'fontFamily',
  'textAlign',
  'textTransform',
  'textIndent',
  'textDecoration',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
  'MozTabSize',
] as const;

const isBrowser = typeof window !== 'undefined';
const isFirefox = isBrowser && (window as any).mozInnerScreenX != null;

export function getCaretCoordinates(element: HTMLTextAreaElement, position: number, options?: { debug?: boolean }): Coordinates {
  if (!isBrowser) {
    // Return a default object or throw an error based on your preference
    return { top: 0, left: 0, height: 0 };
  }

  const debug = options && options.debug || false;
  if (debug) {
    const el = document.querySelector('#input-textarea-caret-position-mirror-div');
    if (el) el.parentNode?.removeChild(el);
  }

  const div = document.createElement('div');
  div.id = 'input-textarea-caret-position-mirror-div';
  document.body.appendChild(div);

  const style = div.style;
  const computed = window.getComputedStyle(element);

  style.whiteSpace = 'pre-wrap';
  style.wordWrap = 'break-word'; // only for textarea-s
  style.position = 'absolute';
  if (!debug) style.visibility = 'hidden';

  properties.forEach(prop => {
    if (isFirefox && prop === 'width' && computed.boxSizing === 'border-box') {
        // With box-sizing: border-box we need to offset the size slightly for Firefox
        // This is not perfect but works reasonably well
        const width = parseFloat(computed.width);
        const paddingLeft = parseFloat(computed.paddingLeft);
        const paddingRight = parseFloat(computed.paddingRight);
        const borderLeft = parseFloat(computed.borderLeftWidth);
        const borderRight = parseFloat(computed.borderRightWidth);
        style.width = `${width - paddingLeft - paddingRight - borderLeft - borderRight}px`;
    } else {
        style[prop as any] = computed[prop as any];
    }
  });

  if (isFirefox) {
    if (element.scrollHeight > parseInt(computed.height))
      style.overflowY = 'scroll';
  } else {
    style.overflow = 'hidden';
  }

  div.textContent = element.value.substring(0, position);

  const span = document.createElement('span');
  span.textContent = element.value.substring(position) || '.';
  div.appendChild(span);

  const coordinates = {
    top: span.offsetTop + parseInt(computed['borderTopWidth']),
    left: span.offsetLeft + parseInt(computed['borderLeftWidth']),
    height: parseInt(computed['lineHeight'])
  };

  if (debug) {
    span.style.backgroundColor = '#aaa';
  } else {
    document.body.removeChild(div);
  }

  return coordinates;
}
