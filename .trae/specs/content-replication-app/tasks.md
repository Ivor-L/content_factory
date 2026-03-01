# Tasks

- [x] Task 1: Initialize Project Structure & Layout
  - [x] SubTask 1.1: Create core directories (components, lib, types, app/api).
  - [x] SubTask 1.2: Setup Tailwind CSS theme/colors (optional, basic styling).
  - [x] SubTask 1.3: Create Main Layout (Navbar/Sidebar) and Homepage.
  - [x] SubTask 1.4: Setup Prisma Schema (Product, Script, Replication) based on requirements.
  - [x] SubTask 1.5: Setup n8n API Client structure (Mock or Config).

- [x] Task 2: Product Library Implementation
  - [x] SubTask 2.1: Implement Product List Page (fetch from DB/API).
  - [x] SubTask 2.2: Implement Product Upload/Add Page (Form handling).
  - [x] SubTask 2.3: Integrate Product Analysis API (n8n call).
  - [x] SubTask 2.4: Implement Product Detail Page (Display analysis result).

- [x] Task 3: Script Library Implementation
  - [x] SubTask 3.1: Implement Script List Page (fetch from DB/API).
  - [x] SubTask 3.2: Implement Script Upload/Add Page (Video upload/link handling).
  - [x] SubTask 3.3: Integrate Script Breakdown API (n8n call).
  - [x] SubTask 3.4: Implement Script Detail Page (Display breakdown logic).

- [x] Task 4: Content Replication Implementation
  - [x] SubTask 4.1: Implement Replication Selection Page (Select Product & Script).
  - [x] SubTask 4.2: Integrate Replication API (n8n call: Product + Script -> Prompt/Video).
  - [x] SubTask 4.3: Implement Result Display Page (Show generated content).
  - [x] SubTask 4.4: Add history/log view for past replications.

- [x] Task 5: Additional Generation Pages Implementation
  - [x] SubTask 5.1: Implement "Generate from Selling Points" Page (Form & API Integration).
  - [x] SubTask 5.2: Implement "Generate from Script" Page (Form & API Integration).

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1]
- [Task 4] depends on [Task 2] and [Task 3] (needs data from both)
- [Task 5] depends on [Task 1] (and possibly Task 2/3 if reusing components)
