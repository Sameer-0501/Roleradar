
export const SKILL_CATEGORIES: Record<string, string[]> = {
    "Core CS": ["DSA", "OOP", "DBMS", "OS", "Networks", "Data Structures", "Algorithms", "Operating Systems", "Computer Networks"],
    "Languages": ["Java", "Python", "JavaScript", "TypeScript", "C", "C++", "C#", "Go", "Ruby", "Swift", "Kotlin", "Rust"],
    "Web": ["React", "Next.js", "Node.js", "Express", "REST", "GraphQL", "HTML", "CSS", "Tailwind", "Redux", "Vue", "Angular"],
    "Data": ["SQL", "MongoDB", "PostgreSQL", "MySQL", "Redis", "NoSQL", "Firebase", "Cassandra"],
    "Cloud/DevOps": ["AWS", "Azure", "GCP", "Docker", "Kubernetes", "CI/CD", "Linux", "Jenkins", "Terraform"],
    "Testing": ["Selenium", "Cypress", "Playwright", "JUnit", "PyTest", "Jest", "Mocha"],
};

export const INTERVIEW_QUESTIONS: Record<string, string[]> = {
    // Languages
    "Java": ["Explain OOP concepts (Polymorphism, Inheritance, Encapsulation).", "Difference between HashMap and Hashtable.", "What is Garbage Collection and how does it work?", "Explain the difference between final, finally, and finalize.", "What are Java Streams?"],
    "Python": ["Explain list comprehension with an example.", "Difference between Generator and Iterator?", "How is memory managed in Python?", "Explain decorators in Python.", "What is the difference between deep copy and shallow copy?"],
    "JavaScript": ["Explain the Event Loop.", "Difference between var, let, and const.", "What are Promises and Async/Await?", "Explain Closures in JavaScript.", "What is 'this' keyword?"],
    "TypeScript": ["Difference between Interface and Type.", "What are Generics?", "Explain Union and Intersection types.", "How does TypeScript compile to JavaScript?"],
    "C++": ["Virtual functions and their use.", "Difference between C and C++.", "What are pointers and references?", "Explain memory management (new/delete)."],

    // Web
    "React": ["Explain Virtual DOM.", "Significance of keys in lists.", "Difference between Class and Functional components.", "Explain useEffect and its dependency array.", "State management (Redux/Context API)."],
    "Node.js": ["Explain Event Driven Architecture.", "Difference between process.nextTick and setImmediate.", "How to handle streaming data?", "Explain Middleware in Express.", "How to avoid Callback Hell?"],
    "HTML": ["Semantic vs Non-semantic tags.", "HTML5 new features.", "Local Storage vs Session Storage vs Cookies."],
    "CSS": ["Flexbox vs Grid.", "Box Model explanation.", "CSS Specificity rules.", "How to center a div horizontally and vertically?"],

    // Data
    "SQL": ["Difference between WHERE and HAVING.", "Explain ACID properties.", "Indexing strategies.", "Left Join vs Inner Join.", "Normalization forms (1NF, 2NF, 3NF)."],
    "MongoDB": ["SQL vs NoSQL differences.", "Aggregation pipeline.", "Indexing in MongoDB.", "How does replication work?"],

    // Core CS
    "DSA": ["Time complexity of Binary Search.", "Explain QuickSort algorithm.", "Difference between Array and Linked List.", "DFS vs BFS applications.", "Hash Map collision resolution techniques."],
    "OOP": ["Explain the 4 pillars of OOP.", "Overloading vs Overriding.", "Abstract Class vs Interface.", "Composition vs Inheritance."],
    "DBMS": ["What is a transaction?", "Explain Deadlock in DB.", "Primary Key vs Foreign Key."],
    "OS": ["Process vs Thread.", "Scheduling algorithms (Round Robin, FCFS).", "What is Paging and Segmentation?", "Explain Semaphores and Mutex."],
    "Networks": ["OSI Model Layers.", "TCP vs UDP.", "What is DNS?", "Explain HTTP/HTTPS handshake.", "What is a Proxy?"],
};

const DEFAULT_QUESTIONS = [
    "Tell me about yourself.",
    "Why do you want to join our company?",
    "Describe a challenging project you worked on.",
    "What are your strengths and weaknesses?",
    "Where do you see yourself in 5 years?"
];

// Helper to escape special regex chars
const escapeRegExp = (string: string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// Helper to determine checklist items based on skills
const getDetailedChecklist = (skills: Record<string, string[]>) => {
    const baseChecklist: Record<string, string[]> = {
        "Round 1: Aptitude / Basics": [
            "Quantitative Aptitude (Time & Work, Percentages)",
            "Logical Reasoning (Series, Puzzles)",
            "Verbal Ability (Reading Comprehension)",
            "Prepare a 1-minute self-introduction",
            "Be ready to explain resume projects briefly",
            "Check company background and values",
            "Review job description thoroughly"
        ],
        "Round 2: DSA / Core CS": [
            "Review Array and String manipulation problems",
            "Practice Linked List and Tree traversals",
            "Understand Time and Space Complexity (Big O)",
            "Revise OOP concepts (Polymorphism, Inheritance)",
            "SQL queries (Joins, Group By)",
            "Operating Systems basics (Process, Threads)",
            "DBMS Normalization and ACID properties"
        ],
        "Round 3: Tech Interview": [
            "Deep dive into final year project architecture",
            "Be prepared to code a simple problem on paper/whiteboard",
            "System Design basics (Scalability, Load Balancing)",
            "Explain challenges faced in projects",
            "Why did you choose this tech stack?",
            "Code optimization discussion"
        ],
        "Round 4: Managerial / HR": [
            "STAR method for behavioral questions",
            "Why this role specifically?",
            "Salary negotiation preparation",
            "Questions to ask the interviewer",
            "Availability and relocation preferences",
            "Explain study gaps (if any)"
        ]
    };

    // Adapt specifically
    if (skills["Web"]) {
        baseChecklist["Round 3: Tech Interview"].push("Frontend/Backend integration flow");
        baseChecklist["Round 3: Tech Interview"].push("API error handling strategies");
    }
    if (skills["Data"]) {
        baseChecklist["Round 2: DSA / Core CS"].push("Complex SQL Query writing");
        baseChecklist["Round 3: Tech Interview"].push("Database Schema Design discussion");
    }

    return baseChecklist;
};

const KNOWN_ENTERPRISES = [
    "Amazon", "Google", "Microsoft", "TCS", "Infosys", "Wipro", "Accenture",
    "Deloitte", "Capgemini", "IBM", "Oracle", "Cisco", "Intel", "Samsung", "HCL", "Cognizant"
];

const getCompanyIntel = (company: string) => {
    const normalized = company.trim();
    if (!normalized) return null;

    const isEnterprise = KNOWN_ENTERPRISES.some(e => normalized.toLowerCase().includes(e.toLowerCase()));

    // Simple heuristic
    if (isEnterprise) {
        return {
            size: 'Enterprise' as const,
            industry: 'Technology & Services',
            focus: 'Strong focus on DSA, Problem Solving, and Core Fundamentals (OS/DBMS).'
        };
    }

    return {
        size: 'Startup' as const,
        industry: 'Technology / Product',
        focus: 'Practical application, Speed of delivery, and Tech Stack depth.'
    };
};

const getRoundMapping = (intel: ReturnType<typeof getCompanyIntel>) => {
    if (!intel) return [];

    if (intel.size === 'Enterprise') {
        return [
            { round: "Round 1: Online Assessment", desc: "Aptitude + 2-3 DSA Coding questions.", whyMatters: "Filters candidates based on raw problem-solving speed." },
            { round: "Round 2: Technical Interview 1", desc: "Live Coding (DSA) + Core CS (DBMS/OS).", whyMatters: "Validates your computer science fundamentals." },
            { round: "Round 3: Technical Interview 2", desc: "Project Deep Dive + System Design Basics.", whyMatters: "Tests your ability to build and explain software." },
            { round: "Round 4: HR / Managerial", desc: "Behavioral fit, willingness to relocate, stability.", whyMatters: "Ensures you fit the company culture long-term." }
        ];
    } else {
        // Startup
        return [
            { round: "Round 1: Screening / Task", desc: "Resume screening or Take-home coding assignment.", whyMatters: "Checks if you can actually write code that runs." },
            { round: "Round 2: Technical Discussion", desc: "Stack-specific questions (React/Node) + Live Debugging.", whyMatters: "Assesses immediate productivity and stack knowledge." },
            { round: "Round 3: Founder / Culture", desc: "Vision alignment, ownership, and adaptability.", whyMatters: "Startups need people who care about the product." }
        ];
    }
};

export const generateAnalysis = (company: string, role: string, jdText: string) => {
    const extractedSkills: Record<string, string[]> = {};
    let categoryCount = 0;

    // 1. Skill Extraction
    Object.entries(SKILL_CATEGORIES).forEach(([category, keywords]) => {
        const found = keywords.filter(k => {
            const escaped = escapeRegExp(k);
            let pattern = escaped;

            // Heuristic for boundaries
            if (/^\w/.test(k)) {
                pattern = `\\b${pattern}`;
            }
            if (/\w$/.test(k)) {
                pattern = `${pattern}\\b`;
            }

            try {
                return new RegExp(pattern, 'i').test(jdText);
            } catch (e) {
                console.error(`Regex error for ${k}:`, e);
                return false;
            }
        });

        if (found.length > 0) {
            extractedSkills[category] = found;
            categoryCount++;
        }
    });

    // Default if no skills detected
    if (Object.keys(extractedSkills).length === 0) {
        extractedSkills["General"] = ["Communication", "Problem Solving", "Projects"];
        categoryCount = 1;
    }

    // 2. Readiness Score Calculation
    let score = 35; // Start
    const categoryBonus = Math.min(categoryCount * 5, 30); // +5 per category (max 30)
    score += categoryBonus;

    if (company.trim().length > 0) score += 10;
    if (role.trim().length > 0) score += 10;
    if (jdText.length > 800) score += 10;

    if (score > 100) score = 100;
    const baseScore = score; // Store base score

    // 3. Plan Generation
    const plan = [
        { day: "Day 1-2", title: "Foundations & Basics", desc: "Brush up on Aptitude, Logic, and Core CS/Language syntax." },
        { day: "Day 3-4", title: "DSA & Problem Solving", desc: "Solve 5-10 problems daily. Focus on Arrays, Strings, and Logic." },
        { day: "Day 5", title: "Project Deep Dive", desc: "Review your resume projects. Be ready to draw architecture." },
        { day: "Day 6", title: "Mock & Behavioral", desc: "Practice speaking answers aloud. Star method for HR questions." },
        { day: "Day 7", title: "Revision & Calm", desc: "Review cheat sheets. Rest well before the big day." }
    ];

    if (extractedSkills["Web"]) {
        plan[0].desc += " Focus on HTML/CSS/JS fundamentals.";
        plan[2].desc += " Ensure you can explain the flow of your web app.";
    }
    if (extractedSkills["Core CS"]) {
        plan[1].desc += " Revise OS/DBMS concepts deeply.";
    }

    // 4. Checklist
    const checklist = getDetailedChecklist(extractedSkills);

    // 5. Questions
    let questions: string[] = [];

    // Gather specific questions
    const flatSkills = Object.values(extractedSkills).flat();
    flatSkills.forEach(skill => {
        const key = Object.keys(INTERVIEW_QUESTIONS).find(k => k.toLowerCase() === skill.toLowerCase());
        if (key && INTERVIEW_QUESTIONS[key]) {
            questions.push(...INTERVIEW_QUESTIONS[key]);
        }
    });

    // Strategy: Shuffle and pick 10
    // Fisher-Yates shuffle
    for (let i = questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [questions[i], questions[j]] = [questions[j], questions[i]];
    }

    // Pick unique
    questions = Array.from(new Set(questions));

    // Fill defaults
    if (questions.length < 10) {
        questions.push(...DEFAULT_QUESTIONS);
        questions = Array.from(new Set(questions));
    }

    const finalQuestions = questions.slice(0, 10);

    // Initialize map
    const skillConfidenceMap: Record<string, 'know' | 'practice'> = {};
    Object.values(extractedSkills).flat().forEach(skill => {
        skillConfidenceMap[skill] = 'practice';
    });

    // Intel
    const rawIntel = getCompanyIntel(company);
    const roundMapping = getRoundMapping(rawIntel);
    const now = new Date().toISOString();

    return {
        id: Date.now().toString(),
        createdAt: now,
        updatedAt: now,
        company: company || "Unknown Company",
        role: role || "General Role",
        jdText,
        extractedSkills,
        plan,
        checklist,
        questions: finalQuestions,
        baseScore: baseScore,
        readinessScore: baseScore,
        skillConfidenceMap,
        companyIntel: rawIntel || undefined,
        roundMapping
    };
};
