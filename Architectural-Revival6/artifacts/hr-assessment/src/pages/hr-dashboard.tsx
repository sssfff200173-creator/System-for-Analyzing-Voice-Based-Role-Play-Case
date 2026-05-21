import { useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Loader2, Plus, Copy, Check, RefreshCw } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface Session {
  uuid: string;
  status: "pending" | "completed";
  createdAt: string;
  assessment: {
    id: number;
    candidateName: string;
    verdict: string;
    createdAt: string;
  } | null;
}

async function fetchSessions(): Promise<Session[]> {
  const res = await fetch("/api/sessions");
  if (!res.ok) throw new Error("Failed to fetch sessions");
  return res.json();
}

async function createSession(): Promise<{ uuid: string }> {
  const res = await fetch("/api/sessions", { method: "POST" });
  if (!res.ok) throw new Error("Failed to create session");
  return res.json();
}

function CopyLinkButton({ uuid }: { uuid: string }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}${import.meta.env.BASE_URL}interview/${uuid}`;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleCopy} className="gap-1 text-xs h-7 px-2">
      {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
      {copied ? "Скопировано" : "Скопировать ссылку"}
    </Button>
  );
}

export default function HrDashboard() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: sessions, isLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: fetchSessions,
    refetchInterval: 10000,
  });

  const createMutation = useMutation({
    mutationFn: createSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });

  return (
    <Layout>
      <div className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">HR-панель</h1>
            <p className="text-muted-foreground mt-1">Управление интервью кандидатов</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["sessions"] })}
              className="gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Обновить
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="gap-2"
            >
              {createMutation.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Plus className="w-4 h-4" />}
              Создать сессию
            </Button>
          </div>
        </div>

        {createMutation.data && (
          <Card className="border-primary/30 bg-primary/5 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm font-medium mb-1">Ссылка для кандидата:</p>
                <code className="text-sm text-primary break-all">
                  {`${window.location.origin}${import.meta.env.BASE_URL}interview/${createMutation.data.uuid}`}
                </code>
              </div>
              <CopyLinkButton uuid={createMutation.data.uuid} />
            </CardContent>
          </Card>
        )}

        <Card className="shadow-sm overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium text-muted-foreground uppercase tracking-wider">
              Сессии интервью
            </CardTitle>
          </CardHeader>
          {isLoading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : sessions && sessions.length > 0 ? (
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Дата создания</TableHead>
                  <TableHead>Кандидат</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Вердикт</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow key={session.uuid}>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {format(new Date(session.createdAt), "dd MMM yyyy, HH:mm", { locale: ru })}
                    </TableCell>
                    <TableCell className="font-medium">
                      {session.assessment?.candidateName ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={session.status === "completed" ? "default" : "secondary"}>
                        {session.status === "completed" ? "Завершено" : "Ожидание"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {session.assessment ? (
                        <Badge variant={session.assessment.verdict === "Рекомендуется" ? "default" : "destructive"}>
                          {session.assessment.verdict}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <CopyLinkButton uuid={session.uuid} />
                        {session.assessment && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7 px-2"
                            onClick={() => setLocation(`/result/${session.assessment!.id}`)}
                          >
                            Отчёт
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <CardContent className="p-12 text-center text-muted-foreground">
              Нет сессий. Нажмите «Создать сессию», чтобы начать.
            </CardContent>
          )}
        </Card>
      </div>
    </Layout>
  );
}
