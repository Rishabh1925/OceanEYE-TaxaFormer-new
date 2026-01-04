# TaxaFormer

AI-powered eDNA classification platform using transformer-based deep learning for marine biodiversity analysis.

## Overview

TaxaFormer is a web-based platform that leverages the Nucleotide Transformer model to classify environmental DNA (eDNA) sequences. The system provides taxonomic classification from phylum to genus level, with novelty detection for potentially undiscovered species.

## Features

- Transformer-based DNA sequence classification
- PR2 + SILVA reference database integration
- Interactive global biodiversity mapping
- Diversity metrics calculation (Shannon index, species richness)
- Batch processing for multiple samples
- Real-time queue management system
- Database caching for improved performance

## Project Structure

```
taxaformer/
├── src/                    # Frontend (Next.js)
│   ├── app/               # Next.js app router
│   ├── components/        # React components
│   │   ├── charts/       # Visualization components
│   │   └── ui/           # UI primitives (shadcn/ui)
│   └── utils/            # Utility functions
├── backend/               # Python FastAPI backend
│   ├── main.py           # Main API server
│   ├── pipeline.py       # ML pipeline
│   └── queue_system.py   # Job queue management
├── db/                    # Database schemas and utilities
├── notebooks/             # Jupyter notebooks (model training)
└── public/               # Static assets
```

## Quick Start

### Frontend

```bash
npm install
npm run dev
```

### Backend

```bash
cd backend
pip install -r requirements.txt
python main.py
```

## Environment Variables

Create a `.env` file with:

```
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
NGROK_TOKEN=your_ngrok_token (optional, for tunneling)
```

## Tech Stack

- Frontend: Next.js 16, React 19, Tailwind CSS, Recharts
- Backend: FastAPI, PyTorch, Transformers
- Database: Supabase (PostgreSQL)
- ML Model: Nucleotide Transformer (fine-tuned)

## License

MIT
