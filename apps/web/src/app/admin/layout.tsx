'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Upload, Database, Layers, Share2, Activity, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '../components/ThemeToggle';

const navItems = [
  { href: '/admin', label: '仪表盘', icon: Upload },
  { href: '/admin/sources', label: '资源', icon: Database },
  { href: '/admin/chunks', label: '分块', icon: Layers },
  { href: '/admin/graph', label: '图谱', icon: Share2 },
  { href: '/admin/health', label: '健康', icon: Activity },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-background">
      {/* Top navigation bar */}
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center gap-4 px-4 md:px-6">
          {/* Back to Q&A */}
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link href="/">
              <ArrowLeft className="size-4 mr-1" />
              <span className="hidden sm:inline">问答</span>
            </Link>
          </Button>

          <Separator orientation="vertical" className="h-6" />

          {/* Admin branding */}
          <div className="font-semibold text-sm">管理</div>

          {/* Nav links */}
          <nav className="flex items-center gap-1 ml-2">
            {navItems.map((item) => {
              const isActive =
                item.href === '/admin'
                  ? pathname === '/admin'
                  : pathname.startsWith(item.href);

              return (
                <Button
                  key={item.href}
                  variant={isActive ? 'secondary' : 'ghost'}
                  size="sm"
                  asChild
                >
                  <Link
                    href={item.href}
                    className={cn(
                      'gap-1.5',
                      isActive && 'font-semibold'
                    )}
                  >
                    <item.icon className="size-4" />
                    <span className="hidden sm:inline">{item.label}</span>
                  </Link>
                </Button>
              );
            })}
          </nav>

          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
