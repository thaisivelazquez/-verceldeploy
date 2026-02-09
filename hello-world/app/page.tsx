'use client'

import { useState } from 'react'
import { supabase } from '../lib/supabase/client'

export default function Page() {
    const [tables, setTables] = useState<any[]>([])
    const [showTables, setShowTables] = useState(false)

    const fetchTables = async () => {
        const { data, error } = await supabase
            .from('caption_examples')
            .select('*')

        if (error) {
            console.error('Error fetching tables:', error)
            return
        }

        setTables(data ?? [])
        setShowTables(true)
    }

    if (!showTables) {
        return (
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100vh',
                }}
            >
                <button
                    onClick={fetchTables}
                    style={{
                        padding: '12px 24px',
                        fontSize: '18px',
                        backgroundColor: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                    }}
                >
                    Hello World
                </button>
            </div>
        )
    }

    return (
        <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
            <h1 style={{ marginBottom: '20px' }}>caption_examples tables</h1>
            <table
                style={{
                    width: '100%',
                    borderCollapse: 'separate',
                    borderSpacing: '0 10px',
                    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
                }}
            >
                <thead>
                <tr style={{ backgroundColor: '#f3f4f6' }}>
                    <th style={headerCellStyle}>ID</th>
                    <th style={headerCellStyle}>Created Date</th>
                    <th style={headerCellStyle}>Modified Date</th>
                    <th style={headerCellStyle}>Description</th>
                    <th style={headerCellStyle}>Caption</th>
                    <th style={headerCellStyle}>Explanation</th>
                    <th style={headerCellStyle}>Priority</th>
                    <th style={headerCellStyle}>Image ID</th>
                </tr>
                </thead>
                <tbody>
                {tables.map((table: any) => (
                    <tr
                        key={table.id}
                        style={{
                            backgroundColor: '#fff',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                            borderRadius: '8px',
                            marginBottom: '10px',
                        }}
                    >
                        <td style={cellStyle}>{table.id}</td>
                        <td style={cellStyle}>{formatDate(table.created_datetime_utc)}</td>
                        <td style={cellStyle}>{formatDate(table.modified_created_datetime_utc)}</td>
                        <td style={cellStyle}>{table.image_description}</td>
                        <td style={cellStyle}>{table.caption}</td>
                        <td style={cellStyle}>{table.explanation}</td>
                        <td style={cellStyle}>
                            <PriorityBadge priority={table.priority} />
                        </td>
                        <td style={cellStyle}>{table.image_id}</td>
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    )
}

const headerCellStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '12px 15px',
    fontWeight: 600,
    color: '#374151',
    fontSize: '14px',
    borderBottom: '2px solid #e5e7eb',
}

const cellStyle: React.CSSProperties = {
    padding: '12px 15px',
    verticalAlign: 'top',
    fontSize: '14px',
    color: '#4b5563',
    maxWidth: '200px',
    overflowWrap: 'break-word',
}

function formatDate(dateStr: string) {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    })
}

function PriorityBadge({ priority }: { priority: any }) {
    let bgColor = '#d1fae5' // default green
    let textColor = '#065f46'

    if (priority === 'high') {
        bgColor = '#fee2e2' // red
        textColor = '#b91c1c'
    } else if (priority === 'medium') {
        bgColor = '#fef3c7' // yellow
        textColor = '#a16207'
    }

    return (
        <span
            style={{
                backgroundColor: bgColor,
                color: textColor,
                padding: '4px 8px',
                borderRadius: '12px',
                fontWeight: 600,
                fontSize: '12px',
                display: 'inline-block',
                minWidth: '60px',
                textAlign: 'center',
            }}
        >
      {priority ?? '-'}
    </span>
    )
}
