/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET() {
  try {
    const patchNotesDir = path.join(process.cwd(), 'patch_notes')
    
    // Check if directory exists
    if (!fs.existsSync(patchNotesDir)) {
      return NextResponse.json({ versions: [] })
    }

    // Read all files in the patch_notes directory
    const files = fs.readdirSync(patchNotesDir)
    
    // Filter for .md files and extract version info with descriptions
    const versionData = files
      .filter(file => file.endsWith('.md') && file !== 'test.md')
      .map(file => {
        const version = file.replace('.md', '')
        const filePath = path.join(patchNotesDir, file)
        
        // Read the markdown file and extract first H2 header
        let description = 'Release notes and updates'
        try {
          const content = fs.readFileSync(filePath, 'utf8')
          const h2Match = content.match(/^## (.+)$/m)
          if (h2Match) {
            description = h2Match[1].trim()
          }
        } catch (error) {
          console.error(`Error reading ${file}:`, error)
        }
        
        return { version, description }
      })
      .sort((a, b) => {
        // Sort versions in descending order (newest first)
        const aVersion = a.version.split('.').map(Number)
        const bVersion = b.version.split('.').map(Number)
        
        for (let i = 0; i < Math.max(aVersion.length, bVersion.length); i++) {
          const aPart = aVersion[i] || 0
          const bPart = bVersion[i] || 0
          
          if (aPart !== bPart) {
            return bPart - aPart
          }
        }
        
        return 0
      })

    return NextResponse.json({ versions: versionData })
  } catch (error) {
    console.error('Error reading patch notes directory:', error)
    return NextResponse.json({ versions: [] }, { status: 500 })
  }
}