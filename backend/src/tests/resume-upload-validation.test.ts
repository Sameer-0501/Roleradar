import { describe, it, expect } from 'vitest';
import { validateResumeFile } from '../resume/profile-service.js';

describe('Resume Upload Security Validation', () => {
  const validPdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
  const validDocxBuffer = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from('sample docx zip archive content'),
  ]);
  const validTxtBuffer = Buffer.from('Jane Doe\nSoftware Engineer\nSkills: TypeScript, Node.js, React');

  it('accepts valid PDF document with %PDF magic bytes', () => {
    const res = validateResumeFile('candidate_resume.pdf', validPdfBuffer, 'application/pdf');
    expect(res.safeExt).toBe('.pdf');
    expect(res.canonicalMime).toBe('application/pdf');
    expect(res.sanitizedFilename).toBe('candidate_resume.pdf');
  });

  it('accepts valid DOCX document with PK zip magic bytes', () => {
    const res = validateResumeFile(
      'resume.docx',
      validDocxBuffer,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    expect(res.safeExt).toBe('.docx');
    expect(res.canonicalMime).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  });

  it('accepts valid plain text resume', () => {
    const res = validateResumeFile('profile.txt', validTxtBuffer, 'text/plain');
    expect(res.safeExt).toBe('.txt');
    expect(res.canonicalMime).toBe('text/plain');
  });

  it('rejects disallowed file extensions (.exe, .sh, .html, .svg, .js)', () => {
    expect(() => validateResumeFile('malware.exe', validPdfBuffer)).toThrow(
      /Unsupported file format "\.exe"/
    );
    expect(() => validateResumeFile('script.sh', validTxtBuffer)).toThrow(
      /Unsupported file format "\.sh"/
    );
    expect(() => validateResumeFile('page.html', validTxtBuffer)).toThrow(
      /Unsupported file format "\.html"/
    );
    expect(() => validateResumeFile('vector.svg', validTxtBuffer)).toThrow(
      /Unsupported file format "\.svg"/
    );
    expect(() => validateResumeFile('code.js', validTxtBuffer)).toThrow(
      /Unsupported file format "\.js"/
    );
  });

  it('rejects PDF file with spoofed extension and invalid magic header', () => {
    const fakePdf = Buffer.from('This is actually a plain text file, not a real PDF document.');
    expect(() => validateResumeFile('fake.pdf', fakePdf, 'application/pdf')).toThrow(
      /Invalid file signature\. File is not a valid PDF document/
    );
  });

  it('rejects DOCX file with invalid zip header', () => {
    const fakeDocx = Buffer.from('corrupt non-zip word content');
    expect(() => validateResumeFile('fake.docx', fakeDocx)).toThrow(
      /Invalid file signature\. File is not a valid Word document/
    );
  });

  it('rejects text file containing executable binary headers (MZ, ELF)', () => {
    const peBinary = Buffer.concat([Buffer.from([0x4d, 0x5a]), Buffer.from('executable binary code')]);
    expect(() => validateResumeFile('program.txt', peBinary)).toThrow(
      /binary executable signature detected \(MZ\)/
    );

    const elfBinary = Buffer.concat([
      Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
      Buffer.from('linux binary code'),
    ]);
    expect(() => validateResumeFile('elf.txt', elfBinary)).toThrow(
      /binary executable signature detected \(ELF\)/
    );
  });

  it('rejects text file containing null bytes (binary smuggling)', () => {
    const binaryInText = Buffer.from('Some text\0with hidden null bytes');
    expect(() => validateResumeFile('bad.txt', binaryInText)).toThrow(
      /binary characters detected/
    );
  });

  it('rejects text file containing HTML/script tags (stored XSS defense)', () => {
    const htmlResume = Buffer.from('<script>alert("xss")</script>');
    expect(() => validateResumeFile('hacker.txt', htmlResume)).toThrow(
      /HTML tags detected/
    );
  });

  it('rejects empty file', () => {
    expect(() => validateResumeFile('empty.pdf', Buffer.alloc(0))).toThrow(/File is empty/);
  });

  it('rejects file exceeding 5MB service limit', () => {
    const oversizeBuffer = Buffer.alloc(5 * 1024 * 1024 + 1);
    expect(() => validateResumeFile('huge.pdf', oversizeBuffer)).toThrow(
      /File size exceeds maximum limit of 5MB/
    );
  });

  it('sanitizes filenames attempting path traversal', () => {
    const traversalFilename = '../../../../etc/passwd.pdf';
    const res = validateResumeFile(traversalFilename, validPdfBuffer);
    expect(res.sanitizedFilename).not.toContain('/');
    expect(res.sanitizedFilename).not.toContain('\\');
    expect(res.sanitizedFilename).not.toContain('..');
  });

  it('rejects filename containing null byte injection', () => {
    expect(() => validateResumeFile('exploit\0.pdf', validPdfBuffer)).toThrow(
      /null bytes detected/
    );
  });
});
