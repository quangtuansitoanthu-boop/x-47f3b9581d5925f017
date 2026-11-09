package vn.quangtu.tutam.reminders;

/** Same astronomical calculation and Vietnam UTC+7 calendar as lunar-calendar.ts. */
public final class LunarCalendar {
    private static double floor(double n) { return Math.floor(n); }
    private static double julian(int d, int m, int y) {
        double a = floor((14 - m) / 12.0), year = y + 4800 - a, month = m + 12 * a - 3;
        double jd = d + floor((153 * month + 2) / 5) + 365 * year + floor(year / 4) - floor(year / 100) + floor(year / 400) - 32045;
        return jd < 2299161 ? d + floor((153 * month + 2) / 5) + 365 * year + floor(year / 4) - 32083 : jd;
    }
    private static double moon(double k) {
        double t = k / 1236.85, t2 = t*t, t3 = t2*t, r = Math.PI / 180;
        double jd = 2415020.75933 + 29.53058868*k + .0001178*t2 - .000000155*t3;
        jd += .00033*Math.sin((166.56 + 132.87*t - .009173*t2)*r);
        double m = 359.2242 + 29.10535608*k - .0000333*t2 - .00000347*t3;
        double n = 306.0253 + 385.81691806*k + .0107306*t2 + .00001236*t3;
        double f = 21.2964 + 390.67050646*k - .0016528*t2 - .00000239*t3;
        double c = (.1734 - .000393*t)*Math.sin(m*r) + .0021*Math.sin(2*r*m);
        c = c - .4068*Math.sin(n*r) + .0161*Math.sin(2*r*n) - .0004*Math.sin(3*r*n);
        c += .0104*Math.sin(2*r*f) - .0051*Math.sin(r*(m+n));
        c = c - .0074*Math.sin(r*(m-n)) + .0004*Math.sin(r*(2*f+m));
        c = c - .0004*Math.sin(r*(2*f-m)) - .0006*Math.sin(r*(2*f+n));
        c += .001*Math.sin(r*(2*f-n)) + .0005*Math.sin(r*(2*n+m));
        double delta = t < -11 ? .001 + .000839*t + .0002261*t2 - .00000845*t3 - .000000081*t*t3 : -.000278 + .000265*t + .000262*t2;
        return jd + c - delta;
    }
    private static double moonDay(double k) { return floor(moon(k) + .5 + 7.0/24); }
    private static double sun(double day) {
        double t = (day - .5 - 7.0/24 - 2451545)/36525, t2 = t*t, r = Math.PI/180;
        double m = 357.5291 + 35999.0503*t - .0001559*t2 - .00000048*t*t2;
        double l = 280.46645 + 36000.76983*t + .0003032*t2;
        double delta = (1.9146 - .004817*t - .000014*t2)*Math.sin(r*m);
        delta += (.019993 - .000101*t)*Math.sin(2*r*m) + .00029*Math.sin(3*r*m);
        double longitude = (l+delta)*r;
        return floor((longitude - Math.PI*2*floor(longitude/(Math.PI*2)))/Math.PI*6);
    }
    private static double month11(int year) {
        double k = floor((julian(31,12,year)-2415021)/29.530588853), n = moonDay(k);
        return sun(n) >= 9 ? moonDay(k-1) : n;
    }
    private static int leapOffset(double month11) {
        double k = floor((month11-2415021.076998695)/29.530588853+.5), previous;
        int i=1; double arc=sun(moonDay(k+i));
        do { previous=arc; arc=sun(moonDay(k + ++i)); } while (arc != previous && i<14);
        return i-1;
    }
    /** day, month, year, leap (0/1). */
    public static int[] fromSolar(int day, int month, int year) {
        double jd=julian(day,month,year), k=floor((jd-2415021.076998695)/29.530588853);
        double start=moonDay(k+1); if (start>jd) start=moonDay(k);
        double a=month11(year), b=a; int lunarYear;
        if (a>=start) { lunarYear=year; a=month11(year-1); } else { lunarYear=year+1; b=month11(year+1); }
        int lunarDay=(int)(jd-start+1), diff=(int)floor((start-a)/29), lunarMonth=diff+11, leap=0;
        if (b-a>365) { int offset=leapOffset(a); if (diff>=offset) { lunarMonth=diff+10; leap=diff==offset?1:0; } }
        if (lunarMonth>12) lunarMonth-=12;
        if (lunarMonth>=11 && diff<4) lunarYear--;
        return new int[]{lunarDay,lunarMonth,lunarYear,leap};
    }
}
