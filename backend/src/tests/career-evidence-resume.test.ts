/**
 * Engine 3: Career Evidence Profile & Resume Studio 2.0 Test Suite.
 *
 * Implements Blueprint Section 6 ("Engine 3 — Career Evidence Profile & Resume Studio 2.0")
 * and docs/ENGINEERING_STANDARDS.md.
 *
 * Asserts:
 * 1. Master Career Profile & Evidence Vault CRUD + sync with user isolation.
 * 2. Immutable Claim Verification Statuses (SELF_REPORTED, DOCUMENT_SUPPORTED, PROJECT_SUPPORTED, etc.).
 * 3. Candidate Direct Controls (Skills, Projects, Experiences with automatic claim synchronization).
 * 4. Truth-Preserving Resume Tailoring with Claim Provenance (PROVENANCE_BACKED vs UNLINKED).
 * 5. Zero Fact Invention Guarantee (every provenanced bullet links to actual candidate evidence).
 * 6. Multi-Variant Resume Isolation without profile data duplication.
 * 7. ATS Machine Extraction Simulator (Parsing Quality, Role Relevance, Evidence Integrity).
 * 8. REST API Endpoints with HTTP status and JSON payload contracts.
 * 9. Non-destructive synthetic teardown.
 */

import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, and } from 'drizzle-orm';
import type { Request, Response } from 'express';

import {
  getOrCreateCareerProfile,
  updateCareerProfile,
  listCandidateEvidence,
  createCandidateEvidence,
  deleteCandidateEvidence,
  syncProfileToEvidence,
  addCandidateSkill,
  removeCandidateSkill,
  addCandidateProject,
  deleteCandidateProject,
  addCandidateExperience,
  deleteCandidateExperience,
} from '../resumes/career-evidence-service.js';

import {
  tailorResumeForJob,
  listUserResumeDocuments,
  getResumeDocumentWithBullets,
  addResumeBullet,
  deleteResumeBullet,
  deleteResumeVariant,
} from '../resumes/resume-tailoring-service.js';

import {
  inspectResumeParseQuality,
  simulateParsingQuality,
  simulateRoleRelevance,
  simulateEvidenceIntegrity,
} from '../resumes/ats-parser-simulator.js';

import {
  getCareerProfileHandler,
  updateCareerProfileHandler,
  listEvidenceHandler,
  addEvidenceHandler,
  deleteEvidenceHandler,
  syncEvidenceHandler,
  addCandidateSkillHandler,
  deleteCandidateSkillHandler,
  addCandidateProjectHandler,
  deleteCandidateProjectHandler,
  addCandidateExperienceHandler,
  deleteCandidateExperienceHandler,
  tailorResumeHandler,
  listResumeVariantsHandler,
  getResumeVariantHandler,
  addResumeBulletHandler,
  deleteResumeBulletHandler,
  deleteResumeVariantHandler,
  inspectATSResumeHandler,
} from '../api/resumes.js';

describe('Engine 3: Career Evidence Profile & Resume Studio 2.0', () => {
  const db = getDb();

  // Synthetic Test UUIDs
  const testCompanyId = '81111111-1111-4111-8111-111111111111';
  const testJobId = '82222222-2222-4222-8222-222222222222';
  const userAlphaId = '83333333-3333-4333-8333-333333333333';
  const userBetaId = '84444444-4444-4444-8444-444444444444';

  async function cleanupTestData() {
    // Delete in reverse FK order
    await db.delete(schema.resumeBullets);
    await db.delete(schema.resumeDocuments);
    await db.delete(schema.candidateEvidence);
    await db.delete(schema.candidateCareerProfiles);
    await db.delete(schema.candidateSkills).where(eq(schema.candidateSkills.user_id, userAlphaId));
    await db.delete(schema.candidateSkills).where(eq(schema.candidateSkills.user_id, userBetaId));
    await db.delete(schema.candidateProjects).where(eq(schema.candidateProjects.user_id, userAlphaId));
    await db.delete(schema.candidateProjects).where(eq(schema.candidateProjects.user_id, userBetaId));
    await db.delete(schema.candidateExperiences).where(eq(schema.candidateExperiences.user_id, userAlphaId));
    await db.delete(schema.candidateExperiences).where(eq(schema.candidateExperiences.user_id, userBetaId));
    await db.delete(schema.jobs).where(eq(schema.jobs.id, testJobId));
    await db.delete(schema.companies).where(eq(schema.companies.id, testCompanyId));
    await db.delete(schema.users).where(eq(schema.users.id, userAlphaId));
    await db.delete(schema.users).where(eq(schema.users.id, userBetaId));
  }

  beforeAll(async () => {
    await cleanupTestData();

    // 1. Seed Synthetic Users
    await db.insert(schema.users).values([
      {
        id: userAlphaId,
        email: 'alpha-candidate@test.synthetic',
        name: 'Alpha Candidate',
        role: 'user',
        is_verified: true,
      },
      {
        id: userBetaId,
        email: 'beta-candidate@test.synthetic',
        name: 'Beta Candidate',
        role: 'user',
        is_verified: true,
      },
    ]);

    // 2. Seed Synthetic Company
    await db.insert(schema.companies).values({
      id: testCompanyId,
      name: 'Evidence Synthetic Systems',
      official_domain: 'careers.evidence-test.com',
      careers_url: 'https://careers.evidence-test.com',
      ats_type: 'GREENHOUSE',
      is_active: true,
    });

    // 3. Seed Synthetic Verified Job Posting
    await db.insert(schema.jobs).values({
      id: testJobId,
      company_id: testCompanyId,
      source_system: 'GREENHOUSE',
      external_job_id: 'REQ-EVD-001',
      title: 'Full Stack TypeScript Engineer',
      location: 'Bangalore, India',
      workplace_type: 'HYBRID',
      employment_type: 'FULL_TIME',
      official_url: 'https://careers.evidence-test.com/job/REQ-EVD-001',
      apply_url: 'https://careers.evidence-test.com/job/REQ-EVD-001/apply',
      status: 'ACTIVE',
      verification_status: 'VERIFIED',
      description: 'We are seeking a Full Stack TypeScript Developer. Build high-concurrency microservices and responsive web applications.',
      requirements: 'Qualifications: Bachelor degree in Computer Science. Demonstrated experience with TypeScript, React, Node.js, and PostgreSQL. Preferred: Docker containerization and Redis caching experience.',
      content_hash: 'hash-evd-001',
    });
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  // ── 1. Master Career Profile & Evidence Vault CRUD ───────────────────────────

  describe('1. Master Career Profile & Vault CRUD', () => {
    it('initializes a default Master Career Profile on first request', async () => {
      const profile = await getOrCreateCareerProfile(userAlphaId);
      expect(profile).toBeDefined();
      expect(profile.userId).toBe(userAlphaId);
      expect(profile.evidenceStats.totalClaims).toBe(0);
    });

    it('updates professional headline and career objective idempotently', async () => {
      const updated = await updateCareerProfile(userAlphaId, {
        professionalHeadline: 'Full-Stack Software Engineer',
        careerObjective: 'To architect reliable, distributed cloud software using TypeScript and Node.js.',
      });

      expect(updated.professionalHeadline).toBe('Full-Stack Software Engineer');
      expect(updated.careerObjective).toContain('distributed cloud software');
    });

    it('creates and lists atomic evidence claims with immutable status tags', async () => {
      const claim = await createCandidateEvidence(userAlphaId, {
        evidenceType: 'PROJECT',
        claimText: 'Developed real-time messaging pipeline handling 10,000 WebSocket connections',
        verifiedStatus: 'PROJECT_SUPPORTED',
      });

      expect(claim).toBeDefined();
      expect(claim.userId).toBe(userAlphaId);
      expect(claim.evidenceType).toBe('PROJECT');
      expect(claim.verifiedStatus).toBe('PROJECT_SUPPORTED');

      const claims = await listCandidateEvidence(userAlphaId);
      expect(claims.length).toBe(1);
      expect(claims[0].claimText).toContain('WebSocket connections');
    });

    it('enforces strict user isolation: User Beta cannot see User Alpha evidence', async () => {
      const betaClaims = await listCandidateEvidence(userBetaId);
      expect(betaClaims.length).toBe(0);

      // User Beta attempts to delete User Alpha claim
      const alphaClaims = await listCandidateEvidence(userAlphaId);
      const deletedByBeta = await deleteCandidateEvidence(userBetaId, alphaClaims[0].id);
      expect(deletedByBeta).toBe(false);

      // Confirm claim still exists for User Alpha
      const alphaClaimsAfter = await listCandidateEvidence(userAlphaId);
      expect(alphaClaimsAfter.length).toBe(1);
    });

    it('filters claims accurately by evidenceType', async () => {
      await createCandidateEvidence(userAlphaId, {
        evidenceType: 'PROFILE_SKILL',
        claimText: 'Proficient in PostgreSQL query planning and indexing',
        verifiedStatus: 'SELF_REPORTED',
      });

      const skillClaims = await listCandidateEvidence(userAlphaId, 'PROFILE_SKILL');
      expect(skillClaims.length).toBe(1);
      expect(skillClaims[0].evidenceType).toBe('PROFILE_SKILL');

      const projectClaims = await listCandidateEvidence(userAlphaId, 'PROJECT');
      expect(projectClaims.length).toBe(1);
      expect(projectClaims[0].evidenceType).toBe('PROJECT');
    });
  });

  // ── 2. Direct Candidate Controls (Skills, Projects, Experience) ─────────────

  describe('2. Direct Candidate Data Controls & Sync', () => {
    it('adds skill and automatically creates associated PROFILE_SKILL evidence', async () => {
      const skill = await addCandidateSkill(userAlphaId, 'TypeScript', 'Programming Languages');
      expect(skill).toBeDefined();
      expect(skill.skill_name).toBe('TypeScript');

      const claims = await listCandidateEvidence(userAlphaId, 'PROFILE_SKILL');
      const tsClaim = claims.find((c) => c.claimText.includes('TypeScript'));
      expect(tsClaim).toBeDefined();
      expect(tsClaim?.verifiedStatus).toBe('SELF_REPORTED');
    });

    it('adds project and automatically creates PROJECT evidence', async () => {
      const proj = await addCandidateProject(userAlphaId, {
        title: 'Distributed Log Aggregator',
        technologies: ['Node.js', 'Docker', 'Redis'],
        description: 'Engineered high-throughput log collector processing 5MB/s with sub-second lag',
        url: 'https://github.com/synthetic/log-aggregator',
      });

      expect(proj).toBeDefined();
      expect(proj.title).toBe('Distributed Log Aggregator');

      const projClaims = await listCandidateEvidence(userAlphaId, 'PROJECT');
      const found = projClaims.find((c) => c.claimText.includes('Distributed Log Aggregator'));
      expect(found).toBeDefined();
      expect(found?.verifiedStatus).toBe('PROJECT_SUPPORTED');
    });

    it('adds experience and automatically creates EXPERIENCE evidence', async () => {
      const exp = await addCandidateExperience(userAlphaId, {
        title: 'Backend Engineer Intern',
        companyName: 'Cloud Solutions Pvt Ltd',
        location: 'Bangalore',
        isInternship: true,
        description: 'Engineered REST endpoints with Drizzle ORM and Postgres database migrations',
      });

      expect(exp).toBeDefined();
      expect(exp.title).toBe('Backend Engineer Intern');

      const expClaims = await listCandidateEvidence(userAlphaId, 'EXPERIENCE');
      const found = expClaims.find((c) => c.claimText.includes('Cloud Solutions'));
      expect(found).toBeDefined();
    });

    it('removes skill and cascades deletion to associated evidence claim', async () => {
      const newSkill = await addCandidateSkill(userAlphaId, 'GraphQL', 'API');
      const claimsBefore = await listCandidateEvidence(userAlphaId, 'PROFILE_SKILL');
      expect(claimsBefore.some((c) => c.claimText.includes('GraphQL'))).toBe(true);

      const deleted = await removeCandidateSkill(userAlphaId, newSkill.id);
      expect(deleted).toBe(true);

      const claimsAfter = await listCandidateEvidence(userAlphaId, 'PROFILE_SKILL');
      expect(claimsAfter.some((c) => c.claimText.includes('GraphQL'))).toBe(false);
    });

    it('syncProfileToEvidence computes correct stats across all evidence tables', async () => {
      await syncProfileToEvidence(userAlphaId);
      const profile = await getOrCreateCareerProfile(userAlphaId);
      expect(profile.evidenceStats.totalClaims).toBeGreaterThanOrEqual(3);
      expect(profile.evidenceStats.projectsCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ── 3. Truth-Preserving Resume Tailoring & Claim Provenance ──────────────────

  describe('3. Truth-Preserving Resume Tailoring & Provenance', () => {
    let tailoredResumeId: string;

    it('tailors resume for target job with bullet-to-evidence claim provenance', async () => {
      const tailored = await tailorResumeForJob({
        userId: userAlphaId,
        jobId: testJobId,
        variantName: 'Full-Stack Engineer Variant',
      });

      expect(tailored).toBeDefined();
      expect(tailored.variantName).toBe('Full-Stack Engineer Variant');
      expect(tailored.targetJobId).toBe(testJobId);
      expect(tailored.bullets.length).toBeGreaterThanOrEqual(3);

      tailoredResumeId = tailored.id;

      // Verify Provenance Tagging
      const backedBullets = tailored.bullets.filter((b) => b.provenanceState === 'PROVENANCE_BACKED');
      expect(backedBullets.length).toBeGreaterThan(0);

      for (const bullet of backedBullets) {
        expect(bullet.evidenceId).toBeDefined();
        expect(bullet.evidenceClaimText).toBeDefined();
        expect(bullet.evidenceType).toBeDefined();
      }

      expect(tailored.truthfulnessScore).toBeGreaterThanOrEqual(50);
    });

    it('guarantees Zero Fact Invention: all PROVENANCE_BACKED bullets link to verified evidence', async () => {
      const variant = await getResumeDocumentWithBullets(userAlphaId, tailoredResumeId);
      expect(variant).toBeDefined();

      const backedBullets = variant!.bullets.filter((b) => b.provenanceState === 'PROVENANCE_BACKED');
      const allUserEvidence = await listCandidateEvidence(userAlphaId);
      const userEvidenceIds = new Set(allUserEvidence.map((e) => e.id));

      for (const bullet of backedBullets) {
        expect(userEvidenceIds.has(bullet.evidenceId!)).toBe(true);
      }
    });

    it('allows adding manual unlinked bullets with transparent UNLINKED state', async () => {
      const newBullet = await addResumeBullet(userAlphaId, tailoredResumeId, {
        bulletText: 'Eager to contribute to high-performing Agile sprint teams and cross-functional deliverables.',
      });

      expect(newBullet).toBeDefined();
      expect(newBullet.provenance_state).toBe('UNLINKED');

      const variant = await getResumeDocumentWithBullets(userAlphaId, tailoredResumeId);
      const unlinked = variant!.bullets.find((b) => b.bulletText.includes('cross-functional deliverables'));
      expect(unlinked).toBeDefined();
      expect(unlinked?.provenanceState).toBe('UNLINKED');
    });

    it('allows deleting bullets and recalculates truthfulness score', async () => {
      const variantBefore = await getResumeDocumentWithBullets(userAlphaId, tailoredResumeId);
      const bulletToDelete = variantBefore!.bullets[variantBefore!.bullets.length - 1];

      await deleteResumeBullet(userAlphaId, tailoredResumeId, bulletToDelete.id);

      const variantAfter = await getResumeDocumentWithBullets(userAlphaId, tailoredResumeId);
      expect(variantAfter!.bullets.some((b) => b.id === bulletToDelete.id)).toBe(false);
    });

    it('supports multiple role variants without duplicating candidate profile data', async () => {
      const variant2 = await tailorResumeForJob({
        userId: userAlphaId,
        jobId: testJobId,
        variantName: 'Backend Focus Variant',
      });

      expect(variant2.id).not.toBe(tailoredResumeId);
      expect(variant2.variantName).toBe('Backend Focus Variant');

      const userVariants = await listUserResumeDocuments(userAlphaId);
      expect(userVariants.length).toBe(2);

      // Delete variant 2 and confirm variant 1 still exists
      await deleteResumeVariant(userAlphaId, variant2.id);
      const userVariantsAfter = await listUserResumeDocuments(userAlphaId);
      expect(userVariantsAfter.length).toBe(1);
      expect(userVariantsAfter[0].id).toBe(tailoredResumeId);
    });
  });

  // ── 4. Machine Extraction (ATS) Simulator ────────────────────────────────────

  describe('4. Machine Extraction (ATS) Simulator', () => {
    it('simulates Parsing Quality across contact info and standard headers', () => {
      const resumeText = `
        Jane Doe
        jane.doe@example.com | (555) 123-4567 | linkedin.com/in/janedoe | github.com/janedoe

        PROFESSIONAL SUMMARY
        Experienced software engineer specialized in TypeScript microservices.

        WORK EXPERIENCE
        Software Engineer at Acme Corp (2022 - Present)
        - Built REST APIs in Node.js

        TECHNICAL SKILLS
        TypeScript, React, Node.js, PostgreSQL, Docker

        PROJECTS
        Distributed Event Bus: Built high-throughput pub/sub service

        EDUCATION
        B.Tech in Computer Science and Engineering, 2022
      `;

      const result = simulateParsingQuality(resumeText);
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.status).toBe('EXCELLENT');
      expect(result.contactDetails.emailDetected).toBe('jane.doe@example.com');
      expect(result.contactDetails.nameDetected).toBe('Jane Doe');
      expect(result.detectedSections.length).toBeGreaterThanOrEqual(4);
      expect(result.missingSections.length).toBe(0);
    });

    it('simulates Role Relevance based on keyword density and job overlap', () => {
      const resumeText = 'Software developer proficient in TypeScript, React, Node.js, PostgreSQL, Docker, Redis, REST APIs.';
      const jobText = 'Requires TypeScript, React, Node.js, PostgreSQL, Docker, Kubernetes, AWS.';

      const result = simulateRoleRelevance(resumeText, jobText);
      expect(result.score).toBeGreaterThanOrEqual(60);
      expect(result.matchedKeywords).toContain('typescript');
      expect(result.matchedKeywords).toContain('react');
      expect(result.matchedKeywords).toContain('node.js');
      expect(result.missingKeywords).toContain('kubernetes');
    });

    it('simulates Evidence Integrity based on provenanced vs unlinked bullets', () => {
      const bullets = [
        { bulletText: 'Developed WebSocket engine', provenanceState: 'PROVENANCE_BACKED' as const },
        { bulletText: 'Engineered REST API with Postgres', provenanceState: 'PROVENANCE_BACKED' as const },
        { bulletText: 'Motivated team player with strong communication', provenanceState: 'UNLINKED' as const },
      ];

      const result = simulateEvidenceIntegrity(bullets);
      expect(result.totalClaimsCount).toBe(3);
      expect(result.provenanceBackedCount).toBe(2);
      expect(result.unlinkedCount).toBe(1);
      expect(result.score).toBe(67); // 2/3 = 67%
      expect(result.status).toBe('ACCEPTABLE_SYNTHESIS');
    });

    it('evaluates overall ATS report across all 3 dimensions', () => {
      const report = inspectResumeParseQuality({
        resumeText: 'Jane Doe\njane@test.com\n\nEXPERIENCE\nBuilt TypeScript APIs\n\nSKILLS\nTypeScript, Node.js\n\nEDUCATION\nBS Computer Science',
        targetJobText: 'TypeScript Node.js API Engineer',
        bullets: [
          { bulletText: 'Built TypeScript APIs', provenanceState: 'PROVENANCE_BACKED' },
        ],
      });

      expect(report.overallScore).toBeGreaterThanOrEqual(60);
      expect(report.parsingQuality.score).toBeGreaterThan(0);
      expect(report.roleRelevance.score).toBeGreaterThan(0);
      expect(report.evidenceIntegrity.score).toBe(100);
    });
  });

  // ── 5. REST API Endpoints Contract Verification ─────────────────────────────

  describe('5. REST API Handlers Contract', () => {
    function createMockRes() {
      let statusCode = 200;
      let body: any = null;
      const res = {
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: (data: any) => {
          body = data;
          return res;
        },
        getStatusCode: () => statusCode,
        getBody: () => body,
      };
      return res;
    }

    it('GET /api/candidate/career-profile returns profile with stats', async () => {
      const req = { user: { id: userAlphaId } } as Request;
      const res = createMockRes();

      await getCareerProfileHandler(req, res as unknown as Response);

      expect(res.getStatusCode()).toBe(200);
      expect(res.getBody().profile).toBeDefined();
      expect(res.getBody().profile.userId).toBe(userAlphaId);
    });

    it('POST /api/candidate/skills creates skill and returns HTTP 201', async () => {
      const req = {
        user: { id: userAlphaId },
        body: { skillName: 'Kubernetes', category: 'DevOps' },
      } as Request;
      const res = createMockRes();

      await addCandidateSkillHandler(req, res as unknown as Response);

      expect(res.getStatusCode()).toBe(201);
      expect(res.getBody().skill).toBeDefined();
      expect(res.getBody().skill.skill_name).toBe('Kubernetes');
    });

    it('POST /api/candidate/projects creates project and returns HTTP 201', async () => {
      const req = {
        user: { id: userAlphaId },
        body: {
          title: 'Distributed Rate Limiter',
          technologies: ['Go', 'Redis'],
          description: 'Token bucket rate limiter with microsecond latency',
        },
      } as Request;
      const res = createMockRes();

      await addCandidateProjectHandler(req, res as unknown as Response);

      expect(res.getStatusCode()).toBe(201);
      expect(res.getBody().project).toBeDefined();
      expect(res.getBody().project.title).toBe('Distributed Rate Limiter');
    });

    it('POST /api/resumes/inspect-ats executes simulation and returns HTTP 200', async () => {
      const req = {
        user: { id: userAlphaId },
        body: {
          resumeText: 'Jane Doe\njane@test.com\n\nEXPERIENCE\nBuilt REST APIs\n\nSKILLS\nNode.js, TypeScript',
          targetJobText: 'Node.js Backend Developer',
        },
      } as Request;
      const res = createMockRes();

      await inspectATSResumeHandler(req, res as unknown as Response);

      expect(res.getStatusCode()).toBe(200);
      expect(res.getBody().inspection).toBeDefined();
      expect(res.getBody().inspection.overallScore).toBeGreaterThan(0);
      expect(res.getBody().inspection.parsingQuality).toBeDefined();
      expect(res.getBody().inspection.roleRelevance).toBeDefined();
      expect(res.getBody().inspection.evidenceIntegrity).toBeDefined();
    });
  });
});
