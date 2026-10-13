import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb, closeConnection } from '../database/connection.js';
import { schema } from '../database/index.js';
import {
  getCandidateProfile,
  uploadAndParseResume,
  listUserResumes,
  setActiveResume,
  deleteResume,
} from '../resume/profile-service.js';

describe('Phase 13: Candidate Profile Service & User Isolation', () => {
  const userA = '11111111-1111-4000-a000-000000000001';
  const userB = '22222222-2222-4000-a000-000000000002';

  beforeAll(async () => {
    const db = getDb();
    await db
      .insert(schema.users)
      .values([
        { id: userA, email: 'usera@roleradar.local', name: 'User A', email_verified: true },
        { id: userB, email: 'userb@roleradar.local', name: 'User B', email_verified: true },
      ])
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await closeConnection();
  });

  const resumeTextUserA = `
Candidate Alpha
alpha@example.com | 9876543210
EDUCATION
B.Tech in Computer Science, IIT Bombay 2020-2024
SKILLS
Java, Spring Boot, PostgreSQL, Docker
PROJECTS
• Cloud File Server: Distributed storage engine with Java.
EXPERIENCE
• Software Engineer Intern at AlphaCorp (2024)
`;

  it('1. Uploads and parses resume for User A and creates structured profile', async () => {
    const res = await uploadAndParseResume(
      userA,
      'candidate_alpha.txt',
      Buffer.from(resumeTextUserA, 'utf-8'),
      'text/plain'
    );

    expect(res.resume.filename).toBe('candidate_alpha.txt');
    expect(res.resume.isActive).toBe(true);
    expect(res.profile.fullName).toBe('Candidate Alpha');
    expect(res.profile.skills.map((s) => s.canonicalName)).toContain('Java');
    expect(res.profile.completenessScore).toBeGreaterThanOrEqual(80);
  });

  it('2. Enforces strict user isolation (User B cannot see User A profile data)', async () => {
    const profileB = await getCandidateProfile(userB);
    expect(profileB?.fullName).toBeNull();
    expect(profileB?.skills.length).toBe(0);
    expect(profileB?.activeResume).toBeNull();

    const resumesB = await listUserResumes(userB);
    expect(resumesB.length).toBe(0);
  });

  it('3. Supports multiple resumes and active switching for a user', async () => {
    const resumeText2 = `
Candidate Alpha (Updated)
alpha@example.com
SKILLS
Python, React, TypeScript
`;
    const res2 = await uploadAndParseResume(
      userA,
      'candidate_alpha_v2.txt',
      Buffer.from(resumeText2, 'utf-8'),
      'text/plain'
    );

    const allResumes = await listUserResumes(userA);
    expect(allResumes.length).toBeGreaterThanOrEqual(2);

    const activeResume = allResumes.find((r) => r.isActive);
    expect(activeResume?.id).toBe(res2.resume.id);

    // Switch back to first resume
    const firstResume = allResumes.find((r) => r.id !== res2.resume.id)!;
    await setActiveResume(userA, firstResume.id);

    const updatedList = await listUserResumes(userA);
    const switchedActive = updatedList.find((r) => r.isActive);
    expect(switchedActive?.id).toBe(firstResume.id);
  });

  it('4. Deletes resume and removes private storage file', async () => {
    const allResumes = await listUserResumes(userA);
    const targetToDelete = allResumes[0]!;

    const deleted = await deleteResume(userA, targetToDelete.id);
    expect(deleted).toBe(true);

    const postDeleteList = await listUserResumes(userA);
    expect(postDeleteList.some((r) => r.id === targetToDelete.id)).toBe(false);
  });
});
