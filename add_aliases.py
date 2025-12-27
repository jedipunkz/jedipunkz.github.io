#!/usr/bin/env python3
import re
import os
from pathlib import Path

files = [
    "content/post/cloud-cdn.md",
    "content/post/etcd-operator.md",
    "content/post/fluentd-sidecar-gcp.md",
    "content/post/gke-lb.md",
    "content/post/helm.md",
    "content/post/influxdb-go.md",
    "content/post/kubernetes-deployments.md",
    "content/post/kubernetes-scheduledjob.md",
    "content/post/mesos-dcos-vagrant.md",
    "content/post/minikube.md",
    "content/post/serverless-fission.md",
    "content/post/spiceweasel-knife-bootstrap.md",
    "content/post/ssh-mosh.md",
    "content/post/stackforge-openstack-chef-repo-icehouse-deploy.md",
    "content/post/stackstorm.md",
    "content/post/swift-chef.md",
    "content/post/swift-ha-chef-deploy.md",
    "content/post/swift-tempauth.md",
    "content/post/switching-screen->tmux.md",
    "content/post/terraformer.md",
    "content/post/test-kitchen-openstack-chef-cookbooks-test-2.md",
    "content/post/test-kitchen-with-ansible.md",
    "content/post/test-kitchn-openstack-chef-cookbooks-test.md",
    "content/post/usb-stick-de-debian-gnu-slash-linux-insutoru.md",
    "content/post/vyatta-handson-interop2012.md",
    "content/post/vyatta-l2tp-ipsec-vpn.md",
    "content/post/vyatta-timemachine-netatalk.md",
    "content/post/vyatta-vpn.md",
    "content/post/vyatta-wireless-ap.md",
    "content/post/vyattarouter.md",
    "content/post/vyos-vxlan.md",
    "content/post/weave-docker-network.md",
    "content/post/wordpress-wo-nginx-plus-fastcgi-degao-su-hua.md",
]

def extract_date_and_slug(content, filename):
    """Extract date and slug from file"""
    # Try to find date in TOML format
    date_match = re.search(r'^date = "(\d{4}-\d{2}-\d{2})"', content, re.MULTILINE)
    if not date_match:
        # Try YAML format with time
        date_match = re.search(r'^date:\s*"?(\d{4}-\d{2}-\d{2})T', content, re.MULTILINE)
    if not date_match:
        # Try simple YAML format
        date_match = re.search(r'^date:\s*"?(\d{4}-\d{2}-\d{2})"?', content, re.MULTILINE)
    
    if not date_match:
        return None, None
    
    date = date_match.group(1)
    year, month, day = date.split('-')
    
    # Get slug from filename
    slug = Path(filename).stem
    
    return f"{year}/{month}/{day}", slug

def add_aliases_toml(filepath):
    """Add aliases to a TOML front matter file"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Check if already has aliases
    if 'aliases = [' in content or 'aliases=[' in content:
        print(f"Skipping {filepath}: already has aliases")
        return False
    
    date_path, slug = extract_date_and_slug(content, filepath)
    if not date_path:
        print(f"Skipping {filepath}: could not extract date")
        return False
    
    # Find the position to insert aliases (before the closing +++)
    aliases_text = f'''aliases = [
  "/blog/{date_path}/{slug}",
  "/post/{date_path}/{slug}"
]
'''
    
    # Insert before the closing +++
    content = re.sub(r'(\+\+\+)', aliases_text + r'\1', content, count=2)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"Added aliases to {filepath}: /blog/{date_path}/{slug}")
    return True

def main():
    count = 0
    for filepath in files:
        if os.path.exists(filepath):
            if add_aliases_toml(filepath):
                count += 1
        else:
            print(f"File not found: {filepath}")
    
    print(f"\nProcessed {count} files")

if __name__ == "__main__":
    main()