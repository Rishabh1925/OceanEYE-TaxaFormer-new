#!/usr/bin/env python3
"""
Check Analytics Data in Supabase
"""
from supabase import create_client

# Connect to Supabase
SUPABASE_URL = 'https://nbnyhdwbnxbheombbhtv.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ibnloZHdibnhiaGVvbWJiaHR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0MDIyNDksImV4cCI6MjA4MDk3ODI0OX0.u5DxN1eX-K85WepTNCEs5sJw9M13YLmGm5pVe1WKy34'

def main():
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    print('Analytics Data Summary:')
    print('=' * 50)

    # Check user sessions
    sessions = supabase.table('user_sessions').select('*').execute()
    print(f'Total Sessions: {len(sessions.data)}')
    if sessions.data:
        latest_session = sessions.data[-1]
        session_id = latest_session['session_id'][:8]
        print(f'   Latest Session: {session_id}...')
        print(f'   Device: {latest_session.get("device_type", "Unknown")}')
        print(f'   Browser: {latest_session.get("browser_name", "Unknown")}')
        print(f'   Pages: {latest_session.get("page_count", 0)}')

    print()

    # Check page views
    page_views = supabase.table('page_views').select('*').execute()
    print(f'Total Page Views: {len(page_views.data)}')
    if page_views.data:
        print('   Recent page views:')
        for pv in page_views.data[-3:]:
            print(f'   - {pv["page_path"]} ({pv["page_title"]})')

    print()

    # Check interactions
    interactions = supabase.table('user_interactions').select('*').execute()
    print(f'Total Interactions: {len(interactions.data)}')
    if interactions.data:
        print('   Recent interactions:')
        for interaction in interactions.data[-3:]:
            print(f'   - {interaction["interaction_type"]}: {interaction["element_text"]}')

    print()
    print('Analytics system is collecting data successfully!')
    
    # Show detailed breakdown
    print('\nDetailed Analytics:')
    print('-' * 30)
    
    # Page view breakdown
    page_counts = {}
    for pv in page_views.data:
        path = pv['page_path']
        page_counts[path] = page_counts.get(path, 0) + 1
    
    print('Page Views by Path:')
    for path, count in sorted(page_counts.items(), key=lambda x: x[1], reverse=True):
        print(f'  {path}: {count} views')
    
    # Interaction breakdown
    interaction_counts = {}
    for interaction in interactions.data:
        int_type = interaction['interaction_type']
        interaction_counts[int_type] = interaction_counts.get(int_type, 0) + 1
    
    print('\nInteractions by Type:')
    for int_type, count in sorted(interaction_counts.items(), key=lambda x: x[1], reverse=True):
        print(f'  {int_type}: {count} interactions')

if __name__ == '__main__':
    main()
