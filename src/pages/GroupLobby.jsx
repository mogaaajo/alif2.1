import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Users, Plus, LogIn, Loader2 } from "lucide-react";
import Header from "@/components/Header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSurahs, createRoom, joinRoom } from "@/lib/api";
import { getUserName, setUserName } from "@/lib/user";

const GroupLobby = () => {
  const navigate = useNavigate();
  const [surahs, setSurahs] = useState([]);
  const [name, setName] = useState(getUserName());
  const [surahNumber, setSurahNumber] = useState("1");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSurahs().then(setSurahs).catch(() => {});
  }, []);

  const surahName = useMemo(
    () => surahs.find((s) => String(s.number) === surahNumber)?.englishName || "",
    [surahs, surahNumber]
  );

  const doCreate = async () => {
    if (!name.trim()) return toast.error("Enter your name first.");
    setBusy(true);
    setUserName(name.trim());
    try {
      const room = await createRoom({
        name: name.trim(),
        surah_number: Number(surahNumber),
        surah_name: surahName,
      });
      localStorage.setItem(`qr_room_${room.code}`, room.device_id);
      navigate(`/group/${room.code}`);
    } catch {
      toast.error("Could not create room.");
    } finally {
      setBusy(false);
    }
  };

  const doJoin = async () => {
    if (!name.trim()) return toast.error("Enter your name first.");
    if (!code.trim()) return toast.error("Enter a room code.");
    setBusy(true);
    setUserName(name.trim());
    try {
      const room = await joinRoom(code.trim().toUpperCase(), { name: name.trim() });
      localStorage.setItem(`qr_room_${room.code}`, room.device_id);
      navigate(`/group/${room.code}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not join room.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Header title="Group Room" subtitle="Recite together, live" />
      <main className="mx-auto max-w-2xl px-5 py-12 sm:px-8">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Users className="h-7 w-7" />
          </span>
          <h1 className="mt-5 font-heading text-4xl font-bold tracking-tight text-foreground">Recite as a circle</h1>
          <p className="mt-3 max-w-lg text-muted-foreground">
            Create a room, share the code, and take turns reciting ayahs live from your own devices.
          </p>
        </motion.div>

        <div className="mt-8 space-y-2">
          <Label className="text-sm font-semibold">Your name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Yusuf" data-testid="group-name-input" />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-6">
            <p className="mb-4 flex items-center gap-2 font-heading text-2xl font-semibold text-foreground">
              <Plus className="h-5 w-5 text-primary" /> Create a room
            </p>
            <Label className="text-sm font-semibold">Surah</Label>
            <Select value={surahNumber} onValueChange={setSurahNumber}>
              <SelectTrigger className="mt-2" data-testid="group-surah-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {surahs.map((s) => (
                  <SelectItem key={s.number} value={String(s.number)}>
                    {s.number}. {s.englishName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button className="mt-5 w-full rounded-full" onClick={doCreate} disabled={busy} data-testid="create-room-btn">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Create & Host
            </Button>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <p className="mb-4 flex items-center gap-2 font-heading text-2xl font-semibold text-foreground">
              <LogIn className="h-5 w-5 text-primary" /> Join a room
            </p>
            <Label className="text-sm font-semibold">Room code</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCDE"
              maxLength={5}
              className="mt-2 text-center text-2xl font-bold tracking-[0.3em]"
              data-testid="group-code-input"
            />
            <Button variant="outline" className="mt-5 w-full rounded-full" onClick={doJoin} disabled={busy} data-testid="join-room-btn">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
              Join Circle
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default GroupLobby;
