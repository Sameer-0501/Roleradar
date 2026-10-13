import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SapCollector } from '../collectors/ats/sap-collector.js';

describe('SapCollector', () => {
  const config = {
    apiBaseUrl: 'https://careers.wipro.com',
    companyName: 'Wipro',
    officialDomain: 'careers.wipro.com',
  };

  let collector: SapCollector;

  beforeEach(() => {
    collector = new SapCollector(config);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should initialize and return correct source properties', () => {
    expect(collector.getSourceName()).toBe('Wipro');
    expect(collector.getSourceType()).toBe('SAP');
    expect(collector.supports('wipro')).toBe(true);
    expect(collector.supports('infosys')).toBe(false);
  });

  it('should discover jobs and construct official URL', async () => {
    const mockResponse = {
      totalJobs: 1,
      jobSearchResult: [
        {
          response: {
            id: '196593',
            unifiedStandardTitle: 'Graduate Engineer Trainee',
            unifiedUrlTitle: 'Graduate-Engineer-Trainee',
            jobLocationShort: ['Gurugram, IND-06, IND, 122016<br/>'],
            description: 'Test Description',
          },
        },
      ],
    };

    const fetchStub = vi.mocked(fetch);
    fetchStub.mockResolvedValueOnce(new Response(JSON.stringify(mockResponse), { status: 200 }));

    const jobs = await collector.discoverJobs();

    expect(jobs).toHaveLength(1);
    expect(jobs[0].externalJobId).toBe('196593');
    expect(jobs[0].title).toBe('Graduate Engineer Trainee');
    expect(jobs[0].location).toBe('Gurugram, IND-06, IND, 122016');
    expect(jobs[0].officialUrl).toBe('https://careers.wipro.com/job/Graduate-Engineer-Trainee/196593/');
    expect(jobs[0].description).toBe('Test Description');
    expect(jobs[0].sourceSystem).toBe('SAP');
  });

  it('should paginate correctly', async () => {
    const fetchStub = vi.mocked(fetch);
    fetchStub
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            totalJobs: 2,
            jobSearchResult: [{ response: { id: '1', unifiedStandardTitle: 'Job 1' } }],
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            totalJobs: 2,
            jobSearchResult: [{ response: { id: '2', unifiedStandardTitle: 'Job 2' } }],
          }),
          { status: 200 }
        )
      );

    const jobs = await collector.discoverJobs();

    expect(jobs).toHaveLength(2);
    expect(fetchStub).toHaveBeenCalledTimes(2);

    const call1Args = JSON.parse(fetchStub.mock.calls[0][1]?.body as string);
    const call2Args = JSON.parse(fetchStub.mock.calls[1][1]?.body as string);

    expect(call1Args.pageNumber).toBe(0);
    expect(call2Args.pageNumber).toBe(1);
  });

  it('should stop paginating when fetching fails', async () => {
    const fetchStub = vi.mocked(fetch);
    fetchStub.mockResolvedValueOnce(new Response(null, { status: 500 }));

    const jobs = await collector.discoverJobs();

    expect(jobs).toHaveLength(0);
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });
});
