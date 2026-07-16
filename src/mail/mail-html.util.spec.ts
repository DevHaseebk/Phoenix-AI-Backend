import { escapeHtml } from './mail-html.util';

describe('escapeHtml', () => {
  it('escapes ampersands, angle brackets, quotes, and slashes', () => {
    expect(escapeHtml('& < > " \' /')).toBe(
      '&amp; &lt; &gt; &quot; &#39; &#x2F;',
    );
  });

  it('neutralizes an injected script tag', () => {
    const malicious = '<script>alert(1)</script>';

    expect(escapeHtml(malicious)).toBe(
      '&lt;script&gt;alert(1)&lt;&#x2F;script&gt;',
    );
    expect(escapeHtml(malicious)).not.toContain('<script>');
  });

  it('leaves plain alphanumeric text untouched', () => {
    expect(escapeHtml('Haseeb Khan 123456')).toBe('Haseeb Khan 123456');
  });
});
