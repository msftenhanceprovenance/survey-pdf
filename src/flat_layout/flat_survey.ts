import { IElement, Question, PanelModelBase, PanelModel } from 'survey-core';
import { SurveyPDF } from '../survey';
import { IPoint, DocController } from '../doc_controller';
import { IPdfBrick } from '../pdf_render/pdf_brick';
import { CompositeBrick } from '../pdf_render/pdf_composite';
import { RowlineBrick } from '../pdf_render/pdf_rowline';
import { SurveyHelper } from '../helper_survey';
import { AdornersPanelOptions, AdornersPageOptions } from '../event_handler/adorners';
import { FlatRepository } from '../entries/pdf';
import * as SurveyPDFModule from '../entries/pdf';

export class FlatSurvey {
    public static readonly QUES_GAP_VERT_SCALE: number = 1.5;
    public static readonly PANEL_CONT_GAP_SCALE: number = 1.0;
    public static readonly PANEL_DESC_GAP_SCALE: number = 0.25;
    public static async generateFlatsPanel(survey: SurveyPDF, controller: DocController,
        panel: PanelModel, point: IPoint): Promise<IPdfBrick[]> {
        let panelFlats: IPdfBrick[] = [];
        let panelContentPoint: IPoint = SurveyHelper.clone(point);
        controller.pushMargins();
        controller.margins.left += controller.measureText(panel.innerIndent).width;
        panelContentPoint.xLeft += controller.measureText(panel.innerIndent).width;
        panelFlats.push(...await this.generateFlatsPagePanel(survey,
            controller, panel, panelContentPoint));
        controller.popMargins();
        let adornersOptions: AdornersPanelOptions = new AdornersPanelOptions(point,
            panelFlats, panel, controller, FlatRepository.getInstance(), SurveyPDFModule);
        await survey.onRenderPanel.fire(survey, adornersOptions);
        return [...adornersOptions.bricks];
    }
    private static async generateFlatsPagePanel(survey: SurveyPDF, controller: DocController,
        pagePanel: PanelModelBase, point: IPoint): Promise<IPdfBrick[]> {
        if (!pagePanel.isVisible) return;
        pagePanel.onFirstRendering();
        let pagePanelFlats: IPdfBrick[] = [];
        let currPoint: IPoint = SurveyHelper.clone(point);
        if (survey.showPageTitles) {
            let compositeFlat: CompositeBrick = new CompositeBrick();
            if (pagePanel.title) {
                let pagelPanelTitleFlat: IPdfBrick = await SurveyHelper.createTitlePanelFlat(
                    currPoint, controller, pagePanel.locTitle);
                compositeFlat.addBrick(pagelPanelTitleFlat);
                currPoint = SurveyHelper.createPoint(pagelPanelTitleFlat);
            }
            if (pagePanel.description) {
                if (pagePanel.title) {
                    currPoint.yTop += controller.unitWidth * FlatSurvey.PANEL_DESC_GAP_SCALE;
                }
                let pagePanelDescFlat: IPdfBrick = await SurveyHelper.createDescFlat(
                    currPoint, null, controller, pagePanel.locDescription);
                compositeFlat.addBrick(pagePanelDescFlat);
                currPoint = SurveyHelper.createPoint(pagePanelDescFlat);
            }
            if (!compositeFlat.isEmpty) {
                pagePanelFlats.push(compositeFlat);
                currPoint.yTop += controller.unitHeight * FlatSurvey.PANEL_CONT_GAP_SCALE;
            }
        }
        for (let row of pagePanel.rows) {
            if (!row.visible) continue;
            controller.pushMargins();
            let width: number = SurveyHelper.getPageAvailableWidth(controller);
            let nextMarginLeft: number = controller.margins.left;
            let rowFlats: IPdfBrick[] = [];
            for (let i: number = 0; i < row.visibleElements.length; i++) {
                let element: IElement = row.visibleElements[i];
                if (!element.isVisible) continue;
                let persWidth: number = SurveyHelper.parseWidth(element.renderWidth,
                    width - (row.visibleElements.length - 1) * controller.unitWidth,
                    row.visibleElements.length);
                controller.margins.left = nextMarginLeft + ((i !== 0) ? controller.unitWidth : 0);
                controller.margins.right = controller.paperWidth - controller.margins.left - persWidth;
                currPoint.xLeft = controller.margins.left;
                nextMarginLeft = controller.margins.left + persWidth;
                if (element instanceof PanelModel) {
                    rowFlats.push(...await this.generateFlatsPanel(
                        survey, controller, element, currPoint));
                }
                else {
                    rowFlats.push(...await SurveyHelper.generateQuestionFlats(survey,
                        controller, <Question>element, currPoint));
                }
            }
            controller.popMargins();
            currPoint.xLeft = controller.margins.left;
            if (rowFlats.length !== 0) {
                currPoint.yTop = SurveyHelper.mergeRects(...rowFlats).yBot;
                currPoint.xLeft = point.xLeft;
                currPoint.yTop += controller.unitHeight * FlatSurvey.QUES_GAP_VERT_SCALE;
                pagePanelFlats.push(...rowFlats);
                pagePanelFlats.push(SurveyHelper.createRowlineFlat(currPoint, controller));
                currPoint.yTop += SurveyHelper.EPSILON;
            }
        }
        return pagePanelFlats;
    }
    private static popRowlines(flats: IPdfBrick[]) {
        while (flats.length > 0 && flats[flats.length - 1] instanceof RowlineBrick) {
            flats.pop();
        }
    }
    private static async generateFlatTitle(survey: SurveyPDF, controller: DocController,
        point: IPoint): Promise<CompositeBrick> {
        let compositeFlat: CompositeBrick = new CompositeBrick();
        if (survey.showTitle) {
            if (survey.title) {
                let surveyTitleFlat: IPdfBrick = await SurveyHelper.createTitleSurveyFlat(
                    point, controller, survey.locTitle);
                compositeFlat.addBrick(surveyTitleFlat);
                point = SurveyHelper.createPoint(surveyTitleFlat);
            }
            if (survey.description) {
                if (survey.title) {
                    point.yTop += controller.unitWidth * FlatSurvey.PANEL_DESC_GAP_SCALE;
                }
                compositeFlat.addBrick(await SurveyHelper.createDescFlat(
                    point, null, controller, survey.locDescription));
            }
        }
        return compositeFlat;
    }
    private static generateFlatLogoImage(survey: SurveyPDF, controller: DocController,
        point: IPoint): IPdfBrick {
        let logoFlat: IPdfBrick = SurveyHelper.createImageFlat(
            point, null, controller, SurveyHelper.getLocString(survey.locLogo),
            SurveyHelper.pxToPt(survey.logoWidth), SurveyHelper.pxToPt(survey.logoHeight));
        let shift: number = 0;
        if (survey.logoPosition === 'right') {
            shift = SurveyHelper.getPageAvailableWidth(controller) - logoFlat.width;
        }
        else if (survey.logoPosition !== 'left') {
            shift = SurveyHelper.getPageAvailableWidth(controller) / 2.0 - logoFlat.width / 2.0; 
        }
        logoFlat.xLeft += shift;
        logoFlat.xRight += shift;
        return logoFlat;
    }
    public static async generateFlats(survey: SurveyPDF, controller: DocController): Promise<IPdfBrick[][]> {
        let flats: IPdfBrick[][] = [];
        if (!survey.hasLogo) {
            let titleFlat: CompositeBrick = await this.generateFlatTitle(
                survey, controller, controller.leftTopPoint);
            if (!titleFlat.isEmpty) flats.push([titleFlat]);
        }
        else if (survey.isLogoBefore) {
            let logoFlat: IPdfBrick = this.generateFlatLogoImage(
                survey, controller, controller.leftTopPoint);
            flats.push([logoFlat]);
            let titlePoint: IPoint = SurveyHelper.createPoint(logoFlat,
                survey.logoPosition === 'top', survey.logoPosition !== 'top');
            if (survey.logoPosition !== 'top') {
                controller.pushMargins();
                titlePoint.xLeft += controller.unitWidth;
                controller.margins.left += logoFlat.width + controller.unitWidth;
            }
            else {
                titlePoint.xLeft = controller.leftTopPoint.xLeft;
                titlePoint.yTop += controller.unitHeight / 2.0;
            }
            let titleFlat: CompositeBrick = await this.generateFlatTitle(
                survey, controller, titlePoint);
            if (survey.logoPosition !== 'top') controller.popMargins();
            if (!titleFlat.isEmpty) flats[0].push(titleFlat);
        }
        else {
            if (survey.logoPosition === 'right') {
                let logoFlat: IPdfBrick = this.generateFlatLogoImage(
                    survey, controller, controller.leftTopPoint);
                flats.push([logoFlat]);
                controller.pushMargins();
                controller.margins.right += logoFlat.width + controller.unitWidth;
                let titleFlat: CompositeBrick = await this.generateFlatTitle(
                    survey, controller, controller.leftTopPoint);
                if (!titleFlat.isEmpty) flats[0].unshift(titleFlat);
                controller.popMargins();
            }
            else {
                let titleFlat: CompositeBrick = await this.generateFlatTitle(
                    survey, controller, controller.leftTopPoint);
                let logoPoint: IPoint = controller.leftTopPoint;
                if (!titleFlat.isEmpty) {
                    flats.push([titleFlat]);
                    logoPoint = SurveyHelper.createPoint(titleFlat);
                    logoPoint.yTop += controller.unitHeight / 2.0;
                }
                let logoFlat: IPdfBrick = this.generateFlatLogoImage(
                    survey, controller, logoPoint);
                flats[0].push(logoFlat);
            }
        }
        for (let i: number = 0; i < survey.visiblePages.length; i++) {
            let pageFlats: IPdfBrick[] = [];
            let point: IPoint = controller.leftTopPoint;
            if (i == 0 && flats.length != 0) {
                point = SurveyHelper.createPoint(
                    SurveyHelper.mergeRects(...flats[0]));
                point.yTop += controller.unitHeight * FlatSurvey.PANEL_CONT_GAP_SCALE;
            }
            pageFlats.push(...await this.generateFlatsPagePanel(
                survey, controller, survey.visiblePages[i], point));
            let adornersOptions: AdornersPageOptions = new AdornersPageOptions(point,
                pageFlats, survey.visiblePages[i], controller, FlatRepository.getInstance(), SurveyPDFModule);
            await survey.onRenderPage.fire(survey, adornersOptions);
            pageFlats = [...adornersOptions.bricks];
            if (i == 0 && flats.length != 0) {
                flats[0].push(...pageFlats);
            }
            else flats.push(pageFlats);
            this.popRowlines(flats[flats.length - 1]);
        }
        return flats;
    }
}