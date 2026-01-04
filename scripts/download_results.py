"""
Download Analysis Results Script
Monitors localStorage and automatically downloads received JSON responses
"""
import time
import json
import os
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager

# Configuration
FRONTEND_URL = "http://localhost:3000"
OUTPUT_DIR = "downloaded_results"
CHECK_INTERVAL = 5  # seconds

def setup_driver():
    """Setup Chrome driver with options"""
    chrome_options = Options()
    chrome_options.add_argument('--disable-gpu')
    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_argument('--disable-dev-shm-usage')
    
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=chrome_options)
    return driver

def get_localstorage_data(driver):
    """Get data from localStorage"""
    try:
        data = driver.execute_script(
            "return localStorage.getItem('analysisResults');"
        )
        if data:
            return json.loads(data)
        return None
    except Exception as e:
        print(f"Error reading localStorage: {e}")
        return None

def save_json_file(data, output_dir):
    """Save JSON data to file"""
    os.makedirs(output_dir, exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    sample_name = data.get('metadata', {}).get('sampleName', 'unknown')
    
    sample_name = sample_name.replace('.fasta', '').replace('.fa', '')
    filename = f"{sample_name}_analysis_{timestamp}.json"
    filepath = os.path.join(output_dir, filename)
    
    with open(filepath, 'w') as f:
        json.dump(data, f, indent=2)
    
    print(f"Downloaded: {filepath}")
    return filepath

def save_csv_files(data, output_dir):
    """Save sequences and taxonomy summary as CSV"""
    os.makedirs(output_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    sample_name = data.get('metadata', {}).get('sampleName', 'unknown')
    sample_name = sample_name.replace('.fasta', '').replace('.fa', '')
    
    if 'sequences' in data and data['sequences']:
        seq_filename = f"{sample_name}_sequences_{timestamp}.csv"
        seq_filepath = os.path.join(output_dir, seq_filename)
        
        with open(seq_filepath, 'w') as f:
            f.write('Accession,Taxonomy,Length,Confidence,Overlap,Cluster,Novelty_Score,Status\n')
            for seq in data['sequences']:
                f.write(f'"{seq.get("accession", "")}",')
                f.write(f'"{seq.get("taxonomy", "")}",')
                f.write(f'{seq.get("length", 0)},')
                f.write(f'{seq.get("confidence", 0)},')
                f.write(f'{seq.get("overlap", 0)},')
                f.write(f'"{seq.get("cluster", "")}",')
                f.write(f'{seq.get("novelty_score", 0)},')
                f.write(f'"{seq.get("status", "Known")}"\n')
        
        print(f"Downloaded: {seq_filepath}")
    
    if 'taxonomy_summary' in data and data['taxonomy_summary']:
        tax_filename = f"{sample_name}_taxonomy_summary_{timestamp}.csv"
        tax_filepath = os.path.join(output_dir, tax_filename)
        
        with open(tax_filepath, 'w') as f:
            f.write('Taxonomy_Group,Count,Color\n')
            for group in data['taxonomy_summary']:
                f.write(f'"{group.get("name", "")}",')
                f.write(f'{group.get("value", 0)},')
                f.write(f'"{group.get("color", "")}"\n')
        
        print(f"Downloaded: {tax_filepath}")

def monitor_and_download():
    """Main monitoring function"""
    print("Starting Analysis Results Monitor")
    print(f"Output directory: {OUTPUT_DIR}")
    print(f"Monitoring: {FRONTEND_URL}")
    print(f"Check interval: {CHECK_INTERVAL}s")
    print("\n" + "="*60)
    
    driver = None
    last_data_hash = None
    
    try:
        driver = setup_driver()
        print("Browser driver initialized")
        
        driver.get(FRONTEND_URL)
        print(f"Opened {FRONTEND_URL}")
        
        print("\nMonitoring for new analysis results...")
        print("   Upload a file to start analysis")
        print("   Press Ctrl+C to stop\n")
        
        while True:
            try:
                data = get_localstorage_data(driver)
                
                if data:
                    current_hash = hash(json.dumps(data, sort_keys=True))
                    
                    if current_hash != last_data_hash:
                        print(f"\nNew data detected at {datetime.now().strftime('%H:%M:%S')}")
                        
                        save_json_file(data, OUTPUT_DIR)
                        save_csv_files(data, OUTPUT_DIR)
                        
                        if 'metadata' in data:
                            meta = data['metadata']
                            print(f"\nAnalysis Summary:")
                            print(f"   Sample: {meta.get('sampleName', 'N/A')}")
                            print(f"   Sequences: {meta.get('totalSequences', 'N/A')}")
                            print(f"   Avg Confidence: {meta.get('avgConfidence', 'N/A')}%")
                            print(f"   Novel Sequences: {meta.get('novelSequences', 'N/A')}")
                        
                        last_data_hash = current_hash
                        print("\nDownload complete! Waiting for next analysis...")
                
                time.sleep(CHECK_INTERVAL)
                
            except KeyboardInterrupt:
                raise
            except Exception as e:
                print(f"Error: {e}")
                time.sleep(CHECK_INTERVAL)
    
    except KeyboardInterrupt:
        print("\n\nMonitoring stopped by user")
    except Exception as e:
        print(f"\nFatal error: {e}")
    finally:
        if driver:
            driver.quit()
            print("Browser closed")
        print(f"\nAll files saved to: {os.path.abspath(OUTPUT_DIR)}")

if __name__ == "__main__":
    monitor_and_download()
