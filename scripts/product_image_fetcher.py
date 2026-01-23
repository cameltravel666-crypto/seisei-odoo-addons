#!/usr/bin/env python3
"""
Product Image Fetcher - Search and upload images for products without images
Uses DuckDuckGo Image Search (no API key needed)
"""

import json
import base64
import requests
import time
import re
import sys
from io import BytesIO
from urllib.parse import quote_plus

# Odoo connection settings
ODOO_URL = "http://web:8069"
ODOO_DB = "ten_testodoo"
ODOO_HOST = "testodoo.seisei.tokyo"  # For dbfilter

# Session for Odoo API calls
odoo_session = requests.Session()
odoo_session.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Host': ODOO_HOST,  # Required for Odoo dbfilter
})

# Session for image search (no custom Host header)
search_session = requests.Session()
search_session.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
})


def odoo_authenticate(login, password):
    """Authenticate with Odoo and return session info"""
    url = f"{ODOO_URL}/web/session/authenticate"
    payload = {
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "db": ODOO_DB,
            "login": login,
            "password": password
        },
        "id": 1
    }
    response = odoo_session.post(url, json=payload)
    result = response.json()
    if result.get('result', {}).get('uid'):
        print(f"✓ Authenticated as {login} (uid={result['result']['uid']})")
        return result['result']
    else:
        raise Exception(f"Authentication failed: {result}")


def odoo_call(model, method, args=None, kwargs=None):
    """Call Odoo JSON-RPC method"""
    url = f"{ODOO_URL}/web/dataset/call_kw/{model}/{method}"
    payload = {
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "model": model,
            "method": method,
            "args": args or [],
            "kwargs": kwargs or {}
        },
        "id": int(time.time() * 1000)
    }
    response = odoo_session.post(url, json=payload)
    result = response.json()
    if 'error' in result:
        raise Exception(f"Odoo error: {result['error']}")
    return result.get('result')


def get_products_without_images(limit=50):
    """Get products that don't have images"""
    products = odoo_call('product.template', 'search_read',
        [[['image_1920', '=', False]]],
        {'fields': ['id', 'name'], 'limit': limit}
    )
    return products


def extract_product_name(name_field):
    """Extract clean product name from Odoo translated name field"""
    if isinstance(name_field, dict):
        # Prioritize Japanese, then Chinese, then English
        for lang in ['ja_JP', 'zh_CN', 'en_US']:
            if lang in name_field and name_field[lang]:
                return name_field[lang]
        # Return first available
        for v in name_field.values():
            if v:
                return v
    return str(name_field) if name_field else None


def search_duckduckgo_images(query, max_results=3):
    """Search DuckDuckGo for images"""
    # DuckDuckGo image search
    search_url = f"https://duckduckgo.com/?q={quote_plus(query)}&iax=images&ia=images"

    try:
        # Get vqd token first
        response = search_session.get(f"https://duckduckgo.com/?q={quote_plus(query)}")
        vqd_match = re.search(r'vqd=(["\'])([^"\']+)\1', response.text)
        if not vqd_match:
            vqd_match = re.search(r'vqd=([\d-]+)', response.text)

        if not vqd_match:
            print(f"  Could not get vqd token")
            return []

        vqd = vqd_match.group(2) if len(vqd_match.groups()) > 1 else vqd_match.group(1)

        # Search images
        img_url = f"https://duckduckgo.com/i.js?l=jp-jp&o=json&q={quote_plus(query)}&vqd={vqd}&f=,,,,,&p=1"
        response = search_session.get(img_url)
        data = response.json()

        images = []
        for result in data.get('results', [])[:max_results]:
            img = result.get('image')
            if img and not img.endswith('.gif'):
                images.append(img)

        return images
    except Exception as e:
        print(f"  DuckDuckGo search error: {e}")
        return []


def search_bing_images(query, max_results=3):
    """Search Bing for images (backup)"""
    search_url = f"https://www.bing.com/images/search?q={quote_plus(query)}&qft=+filterui:photo-photo"

    try:
        response = search_session.get(search_url)
        # Extract image URLs from response
        img_urls = re.findall(r'murl&quot;:&quot;(https?://[^&]+?)&quot;', response.text)

        images = []
        for url in img_urls[:max_results]:
            if not url.endswith('.gif'):
                images.append(url)

        return images
    except Exception as e:
        print(f"  Bing search error: {e}")
        return []


def download_and_compress_image(url, max_size_kb=500):
    """Download image and compress if needed"""
    try:
        response = search_session.get(url, timeout=10)
        if response.status_code != 200:
            return None

        content_type = response.headers.get('content-type', '')
        if 'image' not in content_type:
            return None

        image_data = response.content

        # If image is too large, we can't easily compress without PIL
        # Just return if under limit
        if len(image_data) <= max_size_kb * 1024:
            return base64.b64encode(image_data).decode('utf-8')

        # Try to use PIL if available
        try:
            from PIL import Image
            img = Image.open(BytesIO(image_data))

            # Convert to RGB if necessary
            if img.mode in ('RGBA', 'P'):
                img = img.convert('RGB')

            # Resize if too large
            max_dim = 1024
            if img.width > max_dim or img.height > max_dim:
                ratio = min(max_dim / img.width, max_dim / img.height)
                new_size = (int(img.width * ratio), int(img.height * ratio))
                img = img.resize(new_size, Image.LANCZOS)

            # Compress
            quality = 85
            while quality > 20:
                buffer = BytesIO()
                img.save(buffer, format='JPEG', quality=quality, optimize=True)
                if buffer.tell() <= max_size_kb * 1024:
                    return base64.b64encode(buffer.getvalue()).decode('utf-8')
                quality -= 10

            buffer = BytesIO()
            img.save(buffer, format='JPEG', quality=20, optimize=True)
            return base64.b64encode(buffer.getvalue()).decode('utf-8')

        except ImportError:
            # PIL not available, return as-is if reasonably sized
            if len(image_data) <= 1024 * 1024:  # 1MB limit
                return base64.b64encode(image_data).decode('utf-8')
            return None

    except Exception as e:
        print(f"  Download error: {e}")
        return None


def update_product_image(product_id, image_base64):
    """Update product image in Odoo"""
    result = odoo_call('product.template', 'write',
        [[product_id], {'image_1920': image_base64}]
    )
    return result


def process_products(login, password, limit=50, dry_run=False):
    """Main function to process products"""
    print(f"\n{'='*60}")
    print("Product Image Fetcher")
    print(f"{'='*60}\n")

    # Authenticate
    odoo_authenticate(login, password)

    # Get products without images
    print("\nFetching products without images...")
    products = get_products_without_images(limit)
    print(f"Found {len(products)} products without images\n")

    success_count = 0
    fail_count = 0

    for i, product in enumerate(products):
        product_id = product['id']
        name_raw = product['name']
        name = extract_product_name(name_raw)

        if not name or name in ['test', 'Test', 'test 0088']:
            print(f"[{i+1}/{len(products)}] Skipping product {product_id}: invalid name")
            continue

        print(f"[{i+1}/{len(products)}] Processing: {name} (ID: {product_id})")

        # Search for images
        search_query = f"{name} 商品 食品" if any(ord(c) > 127 for c in name) else f"{name} product food"

        image_urls = search_duckduckgo_images(search_query)
        if not image_urls:
            image_urls = search_bing_images(search_query)

        if not image_urls:
            print(f"  ✗ No images found")
            fail_count += 1
            continue

        # Try to download each image until one works
        image_base64 = None
        for url in image_urls:
            print(f"  Trying: {url[:60]}...")
            image_base64 = download_and_compress_image(url)
            if image_base64:
                break

        if not image_base64:
            print(f"  ✗ Failed to download any image")
            fail_count += 1
            continue

        # Update product
        if dry_run:
            print(f"  ✓ [DRY RUN] Would update product with image ({len(image_base64)} bytes)")
            success_count += 1
        else:
            try:
                update_product_image(product_id, image_base64)
                print(f"  ✓ Image updated successfully")
                success_count += 1
            except Exception as e:
                print(f"  ✗ Failed to update: {e}")
                fail_count += 1

        # Rate limiting
        time.sleep(1)

    print(f"\n{'='*60}")
    print(f"Complete! Success: {success_count}, Failed: {fail_count}")
    print(f"{'='*60}\n")


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Fetch and upload product images')
    parser.add_argument('--login', default='admin', help='Odoo login')
    parser.add_argument('--password', default='odoo', help='Odoo password')
    parser.add_argument('--limit', type=int, default=20, help='Max products to process')
    parser.add_argument('--dry-run', action='store_true', help='Dry run mode')

    args = parser.parse_args()
    process_products(args.login, args.password, args.limit, args.dry_run)
